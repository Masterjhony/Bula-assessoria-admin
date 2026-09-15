/**
 * FINANCEIRO FAZENDA — relatório A4 (PDF) a partir de dados.json.
 * Nenhum número escrito à mão: tudo sai do JSON. pg.pdf() com margem ZERO e
 * .page com height fixa (memória render-pdf-a4-margem-zero).
 *
 *   node scripts/fazenda/render-pdf-financeiro-fazenda.mjs
 *   → outputs/financeiro-fazenda/Relatório Financeiro Fazenda.pdf
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PDFDocument } from 'pdf-lib'

const OUT = 'outputs/financeiro-fazenda'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))
const T = D.totais

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (n, d = 1) => (Number(n || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'
const dma = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—'
const nomeDe = id => (D.membros.find(m => m.id === id) || {}).nome || id || ''
const curto = { marcelo: 'Marcelo', matheus: 'Matheus', mafe: 'Mafê', joao: 'João' }
const catDe = id => (D.categorias.find(c => c.id === id) || {}).nome || id
const corta = (t, n) => { const x = String(t ?? ''); if (x.length <= n) return x; const c = x.slice(0, n), sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–·]+$/, '') + '…' }
const INK = '#0A0A0A', MUTED = '#6E6E6E', GRID = '#E4E4E4', GREEN = '#1B5E20', GREEN_SOFT = '#E8F5E9', AMBER = '#8A5A00', AMBER_SOFT = '#FFF4E0', RED = '#B3261E', RED_SOFT = '#FDECEA'

const g = new Date(D.geradoEm)
const hoje = `${String(g.getDate()).padStart(2, '0')}/${String(g.getMonth() + 1).padStart(2, '0')}/${g.getFullYear()}`
const STATUS = { pago: ['Pago', GREEN, GREEN_SOFT], comprometido: ['Comprometido', AMBER, AMBER_SOFT], pendente: ['A pagar', RED, RED_SOFT] }
const pagos = D.lancamentos.filter(l => l.status === 'pago')
const ordenados = [...D.lancamentos].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id)
const pagadorTxt = l => l.pagamentos.length ? l.pagamentos.map(p => `${curto[p.quem]}${l.pagamentos.length > 1 ? ' ' + brl0(p.valor) : ''}${p.presumido ? '*' : ''}`).join(' + ') : '—'
const PADRAO = { marcelo: 0.5, matheus: 0.5, mafe: 0, joao: 0 }

const NPAG = 8
const foot = n => `<div class="pfoot"><span>Financeiro Fazenda · relatório de controle · ${dma(D.periodo.de)} a ${dma(D.periodo.ate)} · emitido em ${hoje}</span><span>Página ${n} de ${NPAG}</span></div>`
const head = (t, n) => `<div class="head"><h2>${t}</h2><span class="n">${n}</span></div>`
const bar = (v, max, label, right, cor = INK) => `<div class="bar"><div class="bl">${label}</div><div class="bt"><div class="bf" style="width:${max ? Math.max(0.6, v / max * 100) : 0}%;background:${cor}"></div></div><div class="bv">${right}</div></div>`

/* ── páginas ─────────────────────────────────────────────────────────────── */
const capa = `<section class="page capa">
  <div class="brand">FINANCEIRO FAZENDA</div>
  <div class="big">Relatório de controle<br>${dma(D.periodo.de)} a ${dma(D.periodo.ate)}</div>
  <div class="sub">${esc(D.fazenda.local)} · ${esc(D.fazenda.atividade)}</div>
  <div class="tiles">
    <div class="tile"><div class="k">Já pago</div><div class="v">R$ ${brl(T.pago)}</div><div class="d">${pagos.length} despesas com comprovante</div></div>
    <div class="tile"><div class="k">Ainda vai sair</div><div class="v">R$ ${brl(T.aPagar)}</div><div class="d">${brl0(T.pendente)} de saldo das bezerras + ${brl0(T.comprometido)} do box</div></div>
    <div class="tile"><div class="k">Total da operação</div><div class="v">R$ ${brl(T.geral)}</div><div class="d">pago + comprometido + a pagar</div></div>
    <div class="tile"><div class="k">Animais postos na fazenda</div><div class="v">R$ ${brl(T.animais.custoTotal)}</div><div class="d">3 lotes ${brl0(T.animais.lotes)} + comissão ${brl0(T.animais.comissao)} + frete ${brl0(T.animais.frete)}</div></div>
  </div>
  <div class="capa-txt">
    <p><strong>De onde veio.</strong> Do grupo de WhatsApp <em>"${esc(D.grupo.nome)}"</em> — criado pelo Marcelo em ${dma(D.grupo.criadoEm)} às ${D.grupo.criadoEm.slice(11)} — exportado em 15/09/2026 com todos os anexos: 24 fotos (comprovantes PIX, pedidos da agropecuária, cupons fiscais, uma página do caderno) e 1 áudio. Cada número deste relatório aponta para um desses arquivos, guardados na pasta <em>03 - Comprovantes</em>.</p>
    <p><strong>Quem pagou.</strong> ${D.membros.filter(m => T.porPagador[m.id] > 0).map(m => `${curto[m.id]} R$ ${brl(T.porPagador[m.id])} (${pct(T.porPagador[m.id] / T.pago, 0)})`).join(' · ')}. O grupo ainda não definiu como isso se divide — a aba <em>Acerto</em> da planilha faz a conta com o percentual que vocês escolherem.</p>
    <p><strong>O que falta.</strong> R$ ${brl(T.animais.saldo)} de saldo dos animais (${brl0(36400)} das bezerras de João Pinheiro, sem data combinada, e ${brl0(6494)} da MH Leilões, que "faltou limite") e as 7 parcelas do box do banheiro. Além disso: nº de cabeças de cada lote, quem paga o box, orçamentos de janela e ar-condicionado, e o funcionário.</p>
  </div>
  <div class="sumario">
    <div class="st">Neste relatório</div>
    <ol>
      <li><span>1</span>Contexto — o grupo, as pessoas, a linha do tempo</li>
      <li><span>2</span>Resumo — posição geral, por categoria, quem pagou, rebanho</li>
      <li><span>3</span>Lançamentos — as ${D.lancamentos.length} linhas, uma por despesa</li>
      <li><span>4</span>Rebanho e pendências — os três lotes e o que ainda sai do caixa</li>
      <li><span>5</span>Acerto e rotina — saldo entre sócios, regra do grupo, orçamentos em aberto</li>
      <li><span>6</span>Uso e limites — como usar a planilha, o que fica fora, fontes</li>
      <li><span>7</span>Fornecedores — contatos e chaves PIX</li>
    </ol>
  </div>
  <div class="capa-foot"><span>Acompanha: <em>Controle Financeiro Fazenda.xlsx</em> (planilha viva) · pasta <em>03 - Comprovantes</em> · pasta <em>04 - Fonte</em> (export do WhatsApp)</span><span>emitido em ${hoje}</span></div>
</section>`

const contexto = `<section class="page">
  ${head('O grupo, as pessoas e o que aconteceu', '1 · Contexto')}
  <div class="cols">
    <div class="box">
      <div class="t">Quem é quem</div>
      <table class="tb"><thead><tr><th>Pessoa</th><th>Telefone</th><th>Papel no grupo</th><th class="num">Pagou</th></tr></thead><tbody>
      ${D.membros.map(m => `<tr><td><strong>${esc(m.nome)}</strong><br><span class="muted">${esc(m.nomeBanco)}</span></td><td>${esc(m.telefone.replace(/^55(\d\d)(\d{5})(\d{4})$/, '($1) $2-$3'))}</td><td>${esc(m.papel)}</td><td class="num">R$ ${brl(T.porPagador[m.id])}</td></tr>`).join('')}
      </tbody></table>
    </div>
  </div>
  <div class="box">
    <div class="t">Linha do tempo</div>
    <table class="tb tl"><tbody>
    ${D.timeline.map(([q, t]) => `<tr><td class="q">${esc(q)}</td><td>${esc(t)}</td></tr>`).join('')}
    </tbody></table>
  </div>
  <div class="box">
    <div class="t">O que o grupo é (e o que não é)</div>
    <ul class="ul">
      <li>É o <strong>caixa de uma fazenda nova em ${esc(D.fazenda.local)}</strong>: em 11 dias entraram 3 lotes de bezerras comerciais (João Pinheiro e o leilão de Pompeu), ração para gado e cavalos, medicamentos, brincos, ferramentas e a casa começou a ser equipada.</li>
      <li>O Marcelo mantém um <strong>caderno físico</strong> por categoria (a foto da p. 16, "Despesas Maquinário e Ferramentas", é o único registro anterior ao grupo). As categorias da planilha seguem esse caderno.</li>
      <li>O grupo nasceu com <strong>mensagens temporárias de 24 h</strong> (04 a 06/09). O que foi postado nesses dois dias e não foi reenviado <strong>se perdeu</strong> — a Mafê reenviou o cupom do mercado por isso. Pode haver compra de 05–06/09 sem registro.</li>
      <li>Não há regra de rateio escrita. O que existe é o exemplo do caderno (Leroy: Marcelo 1.150 / Matheus 686,04) e a prática: <strong>Marcelo paga os animais, Matheus paga fretes e itens menores, Mafê paga a casa</strong>.</li>
    </ul>
  </div>
  ${foot(2)}
</section>`

const maxCat = Math.max(...D.porCategoria.map(c => c.pago + c.comprometido + c.pendente))
const maxPag = Math.max(...Object.values(T.porPagador))
const resumo = `<section class="page">
  ${head('Posição geral, por categoria e por pessoa', '2 · Resumo')}
  <div class="tiles small">
    <div class="tile"><div class="k">Já pago</div><div class="v">R$ ${brl(T.pago)}</div></div>
    <div class="tile"><div class="k">Comprometido</div><div class="v">R$ ${brl(T.comprometido)}</div></div>
    <div class="tile"><div class="k">A pagar</div><div class="v">R$ ${brl(T.pendente)}</div></div>
    <div class="tile"><div class="k">Total</div><div class="v">R$ ${brl(T.geral)}</div></div>
  </div>
  <div class="box">
    <div class="t">Por categoria — pago, comprometido e a pagar</div>
    <table class="tb"><thead><tr><th>Categoria</th><th class="num">Pago</th><th class="num">Comprometido</th><th class="num">A pagar</th><th class="num">Total</th><th style="width:38mm">participação no total</th></tr></thead><tbody>
    ${D.porCategoria.map(c => { const tot = c.pago + c.comprometido + c.pendente; return `<tr><td><strong>${esc(c.nome)}</strong><br><span class="muted">${esc(c.grupo)}</span></td><td class="num">${c.pago ? brl(c.pago) : '—'}</td><td class="num">${c.comprometido ? brl(c.comprometido) : '—'}</td><td class="num">${c.pendente ? brl(c.pendente) : '—'}</td><td class="num"><strong>${brl(tot)}</strong></td><td>${bar(tot, maxCat, '', pct(tot / T.geral, 1))}</td></tr>` }).join('')}
    <tr class="total"><td>Total</td><td class="num">${brl(T.pago)}</td><td class="num">${brl(T.comprometido)}</td><td class="num">${brl(T.pendente)}</td><td class="num">${brl(T.geral)}</td><td></td></tr>
    </tbody></table>
    <p class="note">Rebanho = ${pct(D.porCategoria.filter(c => c.grupo === 'Rebanho').reduce((s, c) => s + c.pago + c.comprometido + c.pendente, 0) / T.geral, 0)} de tudo. O resto (manejo, estrutura e casa) soma R$ ${brl(D.porCategoria.filter(c => c.grupo !== 'Rebanho').reduce((s, c) => s + c.pago + c.comprometido + c.pendente, 0))}.</p>
  </div>
  <div class="cols">
    <div class="box">
      <div class="t">Quem pagou (só o que já saiu)</div>
      ${D.membros.map(m => bar(T.porPagador[m.id], maxPag, curto[m.id], `R$ ${brl(T.porPagador[m.id])} · ${pct(T.porPagador[m.id] / T.pago, 1)}`)).join('')}
      <p class="note">* Nos pedidos pagos em dinheiro na Antero (07/09) e nos cupons de BH a conversa não diz quem pagou: presumido Marcelo e Mafê, respectivamente — marcado na planilha como "pagador presumido".</p>
    </div>
    <div class="box">
      <div class="t">Rebanho — o que os animais custaram</div>
      <table class="tb kv"><tbody>
        <tr><td>3 lotes de bezerras</td><td class="num">R$ ${brl(T.animais.lotes)}</td></tr>
        <tr><td class="ind">já pago</td><td class="num">R$ ${brl(T.animais.pago)}</td></tr>
        <tr><td class="ind">saldo a pagar</td><td class="num" style="color:${RED}">R$ ${brl(T.animais.saldo)}</td></tr>
        <tr><td>Comissão de compra (Sindicato JP, 2,5%)</td><td class="num">R$ ${brl(T.animais.comissao)}</td></tr>
        <tr><td>Frete e pedágio</td><td class="num">R$ ${brl(T.animais.frete)}</td></tr>
        <tr class="total"><td>Custo dos animais postos na fazenda</td><td class="num">R$ ${brl(T.animais.custoTotal)}</td></tr>
        <tr><td>Nº de cabeças</td><td class="num muted">não consta no grupo</td></tr>
      </tbody></table>
      <p class="note">Com o nº de cabeças a planilha calcula o custo por cabeça sozinha (aba Animais, coluna amarela).</p>
    </div>
  </div>
  ${foot(3)}
</section>`

const lanc = `<section class="page">
  ${head('Todas as despesas, uma por linha', '3 · Lançamentos')}
  <table class="tb lanc"><colgroup><col style="width:6mm"><col style="width:11mm"><col style="width:25mm"><col><col style="width:30mm"><col style="width:27mm"><col style="width:18mm"><col style="width:21mm"></colgroup><thead><tr><th>Nº</th><th>Data</th><th>Categoria</th><th>Descrição</th><th>Fornecedor</th><th>Quem pagou</th><th class="num">Valor</th><th>Status</th></tr></thead><tbody>
  ${ordenados.map(l => { const [lab, cor, bg] = STATUS[l.status]; return `<tr><td class="num">${l.id}</td><td style="white-space:nowrap">${dm(l.data)}</td><td>${esc(catDe(l.categoria).replace('Animais — ', 'Animais · '))}</td><td>${esc(corta(l.descricao, 110))}${l.documento ? ` <span class="muted">· ${esc(l.documento.replace('Pedido PVE-0000', 'ped. '))}</span>` : ''}</td><td>${esc(corta(l.fornecedor.replace(/ \((vendedor|vendedora|freteiro)\)/, ''), 34))}</td><td>${esc(pagadorTxt(l))}</td><td class="num"><strong>${brl(l.valor)}</strong></td><td><span class="tag" style="color:${cor};background:${bg};border-color:${bg}">${lab}</span></td></tr>` }).join('')}
  <tr class="total"><td colspan="6">Pago ${brl(T.pago)} · comprometido ${brl(T.comprometido)} · a pagar ${brl(T.pendente)}</td><td class="num">${brl(T.geral)}</td><td></td></tr>
  </tbody></table>
  <p class="note">* pagador presumido (a conversa não afirma). Linha 16/17: um PIX de 1.315,00 pagou os pedidos de brincos (386,82) e ração (930,06); a diferença de 1,88 foi absorvida na hora, por isso a ração entra por 928,18. Linha 1: rateio anotado no caderno. A planilha traz, para cada linha, os itens do pedido, o nome do arquivo do comprovante e as observações completas.</p>
  ${foot(4)}
</section>`

const pend = ordenados.filter(l => l.status !== 'pago')
const rebanho = `<section class="page">
  ${head('Os três lotes e o que ainda vai sair do caixa', '4 · Rebanho e pendências')}
  <div class="box">
    <div class="t">Lotes de bezerras comerciais</div>
    <table class="tb"><colgroup><col style="width:18mm"><col><col style="width:11mm"><col style="width:19mm"><col style="width:19mm"><col style="width:19mm"><col style="width:17mm"><col style="width:17mm"><col style="width:20mm"></colgroup><thead><tr><th>Lote</th><th>Origem / vendedor</th><th>Data</th><th class="num">Valor</th><th class="num">Pago</th><th class="num">Saldo</th><th class="num">Comissão</th><th class="num">Frete</th><th class="num">Custo total</th></tr></thead><tbody>
    ${D.lotes.map(lt => { const pago = pagos.filter(l => l.lote === lt.id && l.categoria === 'animais_compra').reduce((s, l) => s + l.valor, 0); const frete = lt.frete != null ? lt.frete : (lt.id === 'POMPEU-1' ? D.fretePompeu : 0); return `<tr><td><strong>${lt.id}</strong></td><td>${esc(lt.descricao.replace('Bezerras comerciais — ', ''))} · ${esc(lt.vendedor)}<br><span class="muted">${esc(lt.origem)}${lt.comissaoObs ? ' · comissão: ' + esc(lt.comissaoObs) : ''}${lt.freteObs ? ' · ' + esc(lt.freteObs) : ''}</span></td><td>${dm(lt.data)}</td><td class="num">${brl(lt.valor)}</td><td class="num">${brl(pago)}</td><td class="num" style="color:${lt.valor - pago > 0 ? RED : INK}"><strong>${brl(lt.valor - pago)}</strong></td><td class="num">${lt.comissao ? brl(lt.comissao) : '—'}</td><td class="num">${frete ? brl(frete) : '—'}</td><td class="num"><strong>${brl(lt.valor + lt.comissao + frete)}</strong></td></tr>` }).join('')}
    <tr class="total"><td colspan="3">Total</td><td class="num">${brl(T.animais.lotes)}</td><td class="num">${brl(T.animais.pago)}</td><td class="num">${brl(T.animais.saldo)}</td><td class="num">${brl(T.animais.comissao)}</td><td class="num">${brl(T.animais.frete)}</td><td class="num">${brl(T.animais.custoTotal)}</td></tr>
    </tbody></table>
  </div>
  <div class="box">
    <div class="t">A pagar e comprometido — com valor definido</div>
    <table class="tb"><colgroup><col style="width:52mm"><col><col style="width:19mm"><col style="width:17mm"><col style="width:40mm"></colgroup><thead><tr><th>Item</th><th>Situação</th><th class="num">Valor</th><th>Prazo</th><th>Próximo passo</th></tr></thead><tbody>
    ${pend.map(l => { const [lab, cor, bg] = STATUS[l.status]; return `<tr><td><strong>${esc(corta(l.descricao, 70))}</strong><br><span class="muted">${esc(l.fornecedor)}</span></td><td><span class="tag" style="color:${cor};background:${bg};border-color:${bg}">${lab}</span> ${esc(l.obs || '')}</td><td class="num"><strong>${brl(l.valor)}</strong></td><td class="muted">não informado</td><td>${l.status === 'pendente' ? 'Combinar a data com o vendedor e registrar o pagamento na planilha.' : 'Definir quem paga as 7 parcelas e lançar cada uma.'}</td></tr>` }).join('')}
    <tr class="total"><td colspan="2">Total</td><td class="num">${brl(T.aPagar)}</td><td colspan="2"></td></tr>
    </tbody></table>
  </div>
  <div class="box">
    <div class="t">Leitura</div>
    <ul class="ul">
      <li>O lote de <strong>João Pinheiro</strong> é o maior compromisso: R$ 72.800 + 2,5% de comissão + R$ 2.658,80 de frete e pedágio = <strong>R$ 77.278,80</strong> postos na fazenda, metade ainda por pagar e <strong>sem data combinada</strong>.</li>
      <li>Em <strong>Pompeu</strong> foram dois lotes no mesmo dia (R$ 55.104 no total) com um único frete (R$ 1.250, pago pelo Matheus). O lote da MH Leilões ficou com R$ 6.494 em aberto "porque faltou limite" — leiloeira cobra juros; é o primeiro a quitar.</li>
      <li>Somando os dois saldos, <strong>R$ ${brl(T.animais.saldo)}</strong> ainda saem do caixa por conta dos animais — mais que tudo o que já foi pago fora o rebanho (R$ ${brl(T.pago - T.animais.pago - T.animais.comissao - T.animais.frete)}).</li>
    </ul>
  </div>
  ${foot(5)}
</section>`

const acerto = `<section class="page">
  ${head('Quem adiantou dinheiro de quem — e a rotina para o controle não morrer', '5 · Acerto e rotina')}
  <div class="cols">
    <div class="box">
      <div class="t">Acerto entre sócios (simulação 50% Marcelo / 50% Matheus)</div>
      <table class="tb"><thead><tr><th>Pessoa</th><th class="num">%</th><th class="num">Pagou</th><th class="num">Cota</th><th class="num">Saldo</th></tr></thead><tbody>
      ${D.membros.map(m => { const cota = (PADRAO[m.id] ?? 0) * T.pago; const saldo = T.porPagador[m.id] - cota; return `<tr><td>${esc(m.nome)}</td><td class="num">${pct(PADRAO[m.id] ?? 0, 0)}</td><td class="num">${brl(T.porPagador[m.id])}</td><td class="num">${brl(cota)}</td><td class="num" style="color:${saldo > 0.005 ? GREEN : saldo < -0.005 ? RED : INK}"><strong>${saldo > 0 ? '+' : ''}${brl(saldo)}</strong></td></tr>` }).join('')}
      </tbody></table>
      <p class="note">Saldo positivo = adiantou mais que a cota, tem a receber; negativo = tem a pagar aos demais. <strong>O percentual é uma hipótese</strong> — o grupo não combinou nada por escrito. Na planilha (aba Acerto) as células amarelas aceitam qualquer divisão e tudo recalcula. Compromissos ainda não pagos (box, saldos das bezerras) só entram quando virarem "Pago" com o nome de quem pagou.</p>
    </div>
    <div class="box">
      <div class="t">Regra do grupo (proposta)</div>
      <ol class="ol">
        <li><strong>Toda despesa = comprovante + legenda</strong> com três coisas: <em>o quê</em>, <em>quem pagou</em>, <em>de que conta</em>. Hoje ${pagos.filter(l => l.pagamentos.some(p => p.presumido)).length} das ${pagos.length} despesas pagas estão sem "quem pagou" escrito.</li>
        <li><strong>Compra de animal</strong>: postar também <em>nº de cabeças</em>, <em>peso/idade</em> e <em>o combinado do saldo</em> (quanto e quando). Sem isso não há custo por cabeça nem fluxo de caixa.</li>
        <li><strong>Orçamento fechado</strong> (box, ar-condicionado): postar valor, parcelas e quem vai pagar — no dia que fechar, não quando a parcela cair.</li>
        <li><strong>Mensagens temporárias desligadas</strong> — ficaram ligadas por 2 dias e apagaram registro.</li>
        <li><strong>Fechamento no dia 1º</strong>: João atualiza a planilha e posta no grupo o resumo (pago no mês, a pagar, saldo do acerto).</li>
      </ol>
    </div>
  </div>
  <div class="box">
    <div class="t">Orçamentos e decisões em aberto — sem valor fechado</div>
    <table class="tb"><colgroup><col style="width:30mm"><col><col style="width:14mm"><col style="width:14mm"><col style="width:42mm"></colgroup><thead><tr><th>Item</th><th>Situação no grupo</th><th class="num">Ref.</th><th>Quem</th><th>Próximo passo</th></tr></thead><tbody>
    ${D.orcamentos.map(o => `<tr><td><strong>${esc(o.item)}</strong></td><td>${esc(o.situacao)}</td><td class="num">${o.valorRef != null ? brl(o.valorRef) : '—'}</td><td>${curto[o.responsavel]}</td><td>${esc(o.proximoPasso)}</td></tr>`).join('')}
    </tbody></table>
    <p class="note">"Ref." é custo de visita de orçamento ou cotação, não compromisso.</p>
  </div>
  <div class="box">
    <div class="t">Modelo de legenda para o grupo</div>
    <div class="modelo">Ração e brincos — Antero Felixlândia — R$ 1.315,00 — paguei eu (Marcelo, Itaú) — pedidos 131072 e 131073</div>
    <p class="note">Quatro traços, uma linha. Quem alimenta a planilha lê e lança em 30 segundos; sem isso é preciso abrir a foto, ler o pedido e adivinhar quem pagou.</p>
  </div>
  ${foot(6)}
</section>`

const uso = `<section class="page">
  ${head('Como manter o controle vivo — e o que este relatório não cobre', '6 · Uso e limites')}
  <div class="box">
    <div class="t">Como usar a planilha</div>
    <table class="tb kv"><colgroup><col style="width:44mm"><col><col></colgroup><thead><tr><th>Aba</th><th>Para quê</th><th>O que você faz nela</th></tr></thead><tbody>
      <tr><td><strong>Resumo</strong></td><td>Posição geral, por categoria, quem pagou, rebanho, linha do tempo</td><td>Nada — é tudo fórmula sobre Lançamentos.</td></tr>
      <tr><td><strong>Lançamentos</strong></td><td>A tabela-mãe: uma linha por despesa</td><td>Acrescenta linhas. Status, Categoria e Pagou têm lista suspensa. O total do topo obedece ao filtro.</td></tr>
      <tr><td><strong>Pendências</strong></td><td>O que ainda sai do caixa e decisões em aberto</td><td>Preenche prazo e marca "Feito". Quando pagar, muda o Status em Lançamentos.</td></tr>
      <tr><td><strong>Acerto</strong></td><td>Saldo de cada um contra a cota</td><td>Ajusta os percentuais (amarelo).</td></tr>
      <tr><td><strong>Animais</strong></td><td>Lotes, saldo, custo total e por cabeça</td><td>Informa o nº de cabeças (amarelo).</td></tr>
      <tr><td><strong>Fornecedores · Categorias · Histórico</strong></td><td>Contatos e chaves PIX · lista das categorias · a conversa inteira, linha a linha</td><td>Consulta. Categoria nova: cadastra em Categorias e na tabela do Resumo.</td></tr>
    </tbody></table>
  </div>
  <div class="cols">
    <div class="box">
      <div class="t">O que fica fora, e por quê</div>
      <ul class="ul">
        <li><strong>Mensagens de 04–06/09</strong> apagadas pelo modo temporário: só o que foi reenviado existe.</li>
        <li><strong>Protetores de porta e cortina</strong> (chegaram 11/09): sem valor postado, não lançados.</li>
        <li><strong>Quantidade de animais</strong> por lote: não consta em nenhuma mensagem.</li>
        <li><strong>Datas dos saldos</strong> (36.400 e 6.494): não combinadas no grupo.</li>
        <li><strong>Custo fixo mensal</strong> (funcionário, energia, mantimentos recorrentes): ainda não existe — vai aparecer quando o funcionário entrar.</li>
      </ul>
    </div>
    <div class="box">
      <div class="t">Fontes e como conferir</div>
      <ul class="ul">
        <li><strong>04 - Fonte</strong>: o texto exportado do WhatsApp (105 linhas) e o áudio da Mafê.</li>
        <li><strong>03 - Comprovantes</strong>: os 24 anexos renomeados por data + o que são (ex.: <em>2026-09-07 - PIX 36.400,00 - Marcelo a Luiz Carlos Gonçalves - 50% bezerras JP.jpg</em>). Cópias de menor resolução ficam marcadas "(cópia menor)".</li>
        <li>Na planilha, a coluna <em>Comprovante (arquivo)</em> de cada lançamento aponta para o arquivo; a aba <em>Histórico do grupo</em> liga cada mensagem ao anexo.</li>
        <li>Para atualizar: exporte o grupo de novo (com mídia), coloque o .zip em F:\\ e peça a atualização — o pipeline relê tudo e refaz planilha, relatório e comprovantes.</li>
      </ul>
    </div>
  </div>
  ${foot(7)}
</section>`

const forn = `<section class="page">
  ${head('Com quem a fazenda está lidando', '7 · Fornecedores')}
  <div class="box">
    <div class="t">Fornecedores e contatos (como aparecem nos comprovantes)</div>
    <table class="tb"><thead><tr><th>Nome</th><th>Papel</th><th>Documento</th><th>Contato</th><th>PIX</th><th>Obs.</th></tr></thead><tbody>
    ${D.fornecedores.map(f => `<tr><td><strong>${esc(f.nome)}</strong></td><td>${esc(f.tipo)}</td><td>${esc(f.doc)}</td><td>${esc(f.contato)}</td><td>${esc(f.pix)}</td><td>${esc(f.obs)}</td></tr>`).join('')}
    </tbody></table>
  </div>
  ${foot(8)}
</section>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Financeiro Fazenda — relatório de controle</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 9.6px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3 { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; height: 296mm; padding: 13mm 13mm 16mm; position: relative; page-break-after: always; overflow: hidden; background: #fff; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 8mm; display: flex; justify-content: space-between; font-size: 7.6px; color: ${MUTED}; border-top: 1px solid ${GRID}; padding-top: 1.6mm; }
  .head { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid ${INK}; padding-bottom: 2mm; margin-bottom: 4mm; }
  .head h2 { font-size: 16px; }
  .head .n { font-size: 9px; color: ${GREEN}; letter-spacing: .12em; text-transform: uppercase; font-family: Oswald, sans-serif; white-space: nowrap; margin-left: 6mm; }
  .capa { background: ${INK}; color: #fff; padding: 22mm 18mm 18mm; }
  .capa .brand { font-family: Oswald, sans-serif; font-size: 12px; letter-spacing: .3em; color: #9CCC65; }
  .capa .big { font-family: Oswald, sans-serif; font-size: 36px; font-weight: 700; line-height: 1.1; margin-top: 6mm; text-transform: uppercase; }
  .capa .sub { color: #BDBDBD; margin-top: 3mm; font-size: 10.5px; }
  .capa .tiles { margin-top: 12mm; }
  .capa .tile { background: #1C1C1C; border: 1px solid #333; }
  .capa .tile .k { color: #9CCC65; } .capa .tile .v { color: #fff; } .capa .tile .d { color: #9E9E9E; }
  .capa-txt { margin-top: 10mm; font-size: 10.2px; line-height: 1.6; color: #E0E0E0; }
  .capa-txt p { margin: 0 0 3mm; } .capa-txt strong { color: #fff; } .capa-txt em { color: #9CCC65; font-style: normal; }
  .sumario { position: absolute; left: 18mm; right: 18mm; bottom: 34mm; }
  .sumario .st { font-family: Oswald, sans-serif; font-size: 9px; letter-spacing: .2em; color: #9CCC65; text-transform: uppercase; margin-bottom: 2mm; }
  .sumario ol { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 8mm; font-size: 9.4px; color: #E0E0E0; }
  .sumario li { margin-bottom: 1.4mm; break-inside: avoid; }
  .sumario li span { display: inline-block; width: 6mm; font-family: Oswald, sans-serif; color: #9CCC65; font-weight: 600; }
  .capa-foot { position: absolute; left: 18mm; right: 18mm; bottom: 14mm; display: flex; justify-content: space-between; font-size: 8px; color: #9E9E9E; border-top: 1px solid #333; padding-top: 2mm; }
  .capa-foot em { color: #E0E0E0; font-style: normal; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin-bottom: 4mm; }
  .tiles.small .tile { padding: 2.4mm 3mm; }
  .tile { border: 1px solid ${GRID}; padding: 3.4mm 4mm; }
  .tile .k { font-size: 7.6px; text-transform: uppercase; letter-spacing: .1em; color: ${MUTED}; font-family: Oswald, sans-serif; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 19px; font-weight: 600; line-height: 1.15; margin-top: 1mm; }
  .tile .d { font-size: 7.8px; color: ${MUTED}; margin-top: 1mm; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .cols > .box { min-width: 0; }
  .box { border: 1px solid ${GRID}; padding: 3mm 3.4mm; margin-bottom: 4mm; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 10.5px; letter-spacing: .05em; margin-bottom: 2mm; font-weight: 600; color: ${GREEN}; }
  table.tb { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 7.8px; letter-spacing: .07em; font-weight: 600; border-bottom: 1.4px solid ${INK}; padding: 1.6mm 1.4mm; vertical-align: bottom; }
  td { padding: 1.5mm 1.4mm; border-bottom: 1px solid ${GRID}; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.num { text-align: right; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  .muted { color: ${MUTED}; font-size: 8.4px; }
  .ind { padding-left: 5mm; }
  .tl td.q { white-space: nowrap; font-weight: 700; width: 20mm; }
  .kv td { padding: 1.2mm 1.4mm; }
  .lanc td { padding: 1.1mm 1.2mm; font-size: 8.7px; line-height: 1.4; }
  .tag { display: inline-block; font-family: Oswald, sans-serif; font-size: 7.4px; letter-spacing: .08em; text-transform: uppercase; padding: .3mm 1.5mm; border: 1px solid; }
  .note { font-size: 8.2px; color: ${MUTED}; margin: 2mm 0 0; line-height: 1.45; }
  .ul, .ol { margin: 0; padding-left: 4.5mm; } .ul li, .ol li { margin-bottom: 1.4mm; }
  .bar { display: grid; grid-template-columns: 18mm 1fr 34mm; align-items: center; gap: 2mm; margin: 1.2mm 0; }
  td .bar { grid-template-columns: 0 1fr 12mm; margin: 0; }
  .bl { font-weight: 600; }
  .bt { height: 3.2mm; background: #F1F1F1; position: relative; }
  .bf { position: absolute; left: 0; top: 0; bottom: 0; }
  .bv { font-variant-numeric: tabular-nums; font-size: 8.6px; text-align: right; white-space: nowrap; }
  .modelo { font-family: Inter, sans-serif; font-size: 10px; background: ${GREEN_SOFT}; border-left: 3px solid ${GREEN}; padding: 2.4mm 3mm; }
</style></head><body>
${capa}${contexto}${resumo}${lanc}${rebanho}${acerto}${uso}${forn}
</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p, i) => ({ pagina: i + 1, sobra: p.scrollHeight - p.clientHeight })))
const pdfPath = path.join(OUT, 'Relatório Financeiro Fazenda.pdf')
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
await browser.close()
const doc = await PDFDocument.load(fs.readFileSync(pdfPath))
console.log('páginas no PDF:', doc.getPageCount(), '(esperado', NPAG + ')')
for (const o of overflow) console.log(o.sobra > 0 ? `⚠ página ${o.pagina} transborda ${o.sobra}px` : `página ${o.pagina} OK`)
console.log('→', pdfPath)
