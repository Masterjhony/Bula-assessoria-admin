/**
 * RELATÓRIO 2026 — A BASE DE CLIENTES ATIVOS (PDF).
 *
 *   node scripts/gera-relatorio-base-clientes-2026.mjs [pasta-de-saida]
 *
 * Retrato de quem comprou pela Bula em 2026: quantos são, quanto compram, onde
 * estão, o que compram, quem atende — e, principalmente, o estado do cadastro,
 * que é o que a diretoria pediu para organizar.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pagina, paraPdf, esc, brl, brl0, num, pct, dataBr, mesBr } from './lib/relatorio-2026-visual.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const saida = process.argv[2] || DIR

const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base-clientes.json'), 'utf8'))
const leiloes = JSON.parse(fs.readFileSync(path.join(DIR, 'leiloes-2026.json'), 'utf8'))
const compras = JSON.parse(fs.readFileSync(path.join(DIR, 'compras-2026.json'), 'utf8'))
const f = JSON.parse(fs.readFileSync(path.join(DIR, 'funil-2026.json'), 'utf8'))

const HOJE = '13/08/2026'
const VGV_UNIVERSO = Math.round(leiloes.reduce((a, l) => a + l.vgv, 0) * 100) / 100
const VGV_BASE = Math.round(base.reduce((a, p) => a + p.volumeCompra, 0) * 100) / 100
const ticket = VGV_BASE / base.length

/* ── agregações ───────────────────────────────────────────────────────────── */

const soma = (arr, f2) => Math.round(arr.reduce((a, x) => a + (f2 ? f2(x) : 0), 0) * 100) / 100
const agrupa = (chave) => {
    const m = new Map()
    for (const p of base) {
        const k = chave(p) || '—'
        if (!m.has(k)) m.set(k, { k, n: 0, vgv: 0, animais: 0 })
        const g = m.get(k); g.n++; g.vgv += p.volumeCompra; g.animais += p.animais
    }
    return [...m.values()].sort((a, b) => b.vgv - a.vgv)
}
const porUf = agrupa(p => p.uf)
const porAssessor = agrupa(p => (p.assessor || '').split(',')[0].trim())

// faixas de volume — mostra a concentração
const FAIXAS = [
    ['Acima de R$ 500 mil', p => p.volumeCompra >= 500000],
    ['R$ 200 mil a 500 mil', p => p.volumeCompra >= 200000 && p.volumeCompra < 500000],
    ['R$ 100 mil a 200 mil', p => p.volumeCompra >= 100000 && p.volumeCompra < 200000],
    ['R$ 50 mil a 100 mil', p => p.volumeCompra >= 50000 && p.volumeCompra < 100000],
    ['Até R$ 50 mil', p => p.volumeCompra < 50000],
]
const faixas = FAIXAS.map(([rot, teste]) => {
    const g = base.filter(teste)
    return { rot, n: g.length, vgv: soma(g, p => p.volumeCompra) }
})

// categorias
const catMap = new Map()
for (const p of base) {
    for (const c of String(p.categorias || '').split(',').map(s => s.trim()).filter(Boolean)) {
        if (!catMap.has(c)) catMap.set(c, { c, n: 0 })
        catMap.get(c).n++
    }
}
const categorias = [...catMap.values()].sort((a, b) => b.n - a.n)

const top10 = base.slice(0, 10)
const top10Vgv = soma(top10, p => p.volumeCompra)
const recorrentes = base.filter(p => p.recorrente)
const semCadastro = base.filter(p => !p.cpf || !p.telefone)
const completos = base.filter(p => p.cpf && p.telefone && p.email)

const comp = [
    ['Nome', base.length], ['UF', base.filter(p => p.uf).length], ['Cidade', base.filter(p => p.cidade).length],
    ['Telefone', base.filter(p => p.telefone).length], ['E-mail', base.filter(p => p.email).length],
    ['CPF / CNPJ', base.filter(p => p.cpf).length], ['Fazenda', base.filter(p => p.fazenda).length],
    ['Inscrição Estadual', base.filter(p => p.inscricaoEstadual).length],
    ['Score de crédito', base.filter(p => p.score !== '' && p.score != null).length],
    ['Categoria de compra', base.filter(p => p.categorias).length],
    ['Assessor identificado', base.filter(p => p.assessor).length],
]

/* ── blocos ───────────────────────────────────────────────────────────────── */

const capa = `
<div class="cap">
  <div>
    <h1>Base de clientes — 2026</h1>
    <div class="sub">Quem comprou pela Bula Assessoria neste ano: quanto compram, onde estão, o que buscam,
      quem atende — e o que ainda falta saber sobre eles.</div>
  </div>
  <div class="meta">Bula Assessoria<br>Base: 01/01 a 13/08/2026<br>Emitido em ${HOJE}
    <div class="tot" style="margin-top:6px">${num(base.length)}<small>clientes com compra em 2026</small></div>
  </div>
</div>`

const cards = `
<div class="cards avoid">
  <div class="card"><div class="z">Clientes ativos</div><div class="n">${num(base.length)}<small>compraram ao menos 1 lote no ano</small></div></div>
  <div class="card"><div class="z">Volume comprado</div><div class="n">${brl0(VGV_BASE)}<small>de ${brl0(VGV_UNIVERSO)} de cobertura</small></div></div>
  <div class="card"><div class="z">Ticket por cliente</div><div class="n">${brl0(ticket)}<small>média no ano</small></div></div>
  <div class="card"><div class="z">Recorrentes</div><div class="n">${num(recorrentes.length)}<small>${pct(recorrentes.length, base.length)} · compraram em 2+ leilões</small></div></div>
  <div class="card"><div class="z">Cadastro completo</div><div class="n">${num(completos.length)}<small>${pct(completos.length, base.length)} têm CPF, telefone e e-mail</small></div></div>
</div>`

const cadastro = `
<h2>O estado do cadastro — o problema a resolver</h2>
<p>A diretoria pediu para organizar e preparar a base. Este é o diagnóstico: o ERP registra bem <em>a venda</em>,
mas registra mal <em>o comprador</em>. Cadastra-se o nome no dia do leilão e o resto fica para depois — e depois não
vem. O resultado é uma carteira de ${brl0(VGV_BASE)} que não se consegue contatar por completo.</p>
<table>
  <thead><tr><th>Campo</th><th class="r">Preenchido</th><th class="r">Cobertura</th><th>Visual</th><th>Onde falta</th></tr></thead>
  <tbody>
    ${comp.map(([rot, n]) => `<tr>
      <td class="nome">${rot}</td><td class="num">${num(n)}</td><td class="num">${pct(n, base.length)}</td>
      <td><span class="bar" style="width:${Math.round(n / base.length * 110)}px"></span><span class="bar o" style="width:${Math.round((1 - n / base.length) * 110)}px"></span></td>
      <td class="micro">${n === base.length ? 'completo' : `${num(base.length - n)} clientes sem`}</td></tr>`).join('')}
  </tbody>
</table>
<div class="box alerta avoid">
  <h3>Os três buracos que mais custam</h3>
  <ul>
    <li><strong>${num(semCadastro.length)} clientes (${pct(semCadastro.length, base.length)}) não têm CPF ou telefone</strong> — e
      compraram ${brl0(soma(semCadastro, p => p.volumeCompra))} em 2026, ${pct(soma(semCadastro, p => p.volumeCompra), VGV_BASE)} do volume.
      Sem CPF não há consulta de crédito nem habilitação; sem telefone não há régua de recompra. A aba
      <strong>A COMPLETAR</strong> da planilha traz essa fila já ordenada por quanto cada um comprou.</li>
    <li><strong>Nenhum comprador tem score de crédito consultado.</strong> Os 13 clientes e 42 leads com score na base
      não compraram em 2026. O score foi consultado no funil novo; quem compra vem pelo canal do assessor, que não
      passa por essa etapa. Hoje a Bula habilita quem compra sem saber o risco antes.</li>
    <li><strong>A mesma pessoa aparece com nomes diferentes em cada sistema.</strong> “Dr Celso Lopes” no fechamento,
      “CELSO LOPES” no ERP, “Nelore Grão Pará” na carteira. A base entregue já unificou por CPF, telefone e nome, e a
      coluna OUTROS NOMES guarda as grafias — mas a cura definitiva é cadastrar o CPF na hora do arremate.</li>
  </ul>
</div>`

const concentracao = `
<div class="pg"></div>
<h2>Como a receita se distribui</h2>
<div class="cards avoid">
  <div class="card"><div class="z">Top 10 clientes</div><div class="n">${pct(top10Vgv, VGV_BASE)}<small>${brl0(top10Vgv)} de ${brl0(VGV_BASE)}</small></div></div>
  <div class="card"><div class="z">Top 1 cliente</div><div class="n">${pct(base[0].volumeCompra, VGV_BASE)}<small>${esc(base[0].nome.split('(')[0].trim())}</small></div></div>
  <div class="card"><div class="z">Metade da receita</div><div class="n">${(() => { let s = 0, i = 0; while (s < VGV_BASE / 2 && i < base.length) s += base[i++].volumeCompra; return num(i) })()} clientes<small>concentram 50% do volume</small></div></div>
  <div class="card"><div class="z">Compraram 1 vez só</div><div class="n">${num(base.length - recorrentes.length)}<small>${pct(base.length - recorrentes.length, base.length)} da base</small></div></div>
</div>

<h3>Por faixa de volume</h3>
<table>
  <thead><tr><th>Faixa</th><th class="r">Clientes</th><th class="r">% da base</th><th class="r">Volume</th><th class="r">% do volume</th><th>Visual</th></tr></thead>
  <tbody>
    ${faixas.map(x => `<tr><td class="nome">${x.rot}</td><td class="num">${num(x.n)}</td><td class="num">${pct(x.n, base.length)}</td>
      <td class="num">${brl0(x.vgv)}</td><td class="num">${pct(x.vgv, VGV_BASE)}</td>
      <td><span class="bar" style="width:${Math.round(x.vgv / VGV_BASE * 120)}px"></span></td></tr>`).join('')}
  </tbody>
  <tfoot><tr><td>TOTAL</td><td class="num">${num(base.length)}</td><td class="num">100%</td><td class="num">${brl0(VGV_BASE)}</td><td class="num">100%</td><td></td></tr></tfoot>
</table>
<p class="micro">A leitura de risco: poucos clientes muito grandes sustentam o ano. Perder um comprador da primeira
faixa custa mais do que perder toda a última — e é exatamente da primeira faixa que o cadastro está mais incompleto,
porque são compradores antigos que nunca passaram por formulário.</p>

<h3>Os 10 maiores</h3>
<table>
  <thead><tr><th>Cliente</th><th>UF</th><th class="r">Volume 2026</th><th class="r">Lotes</th><th class="r">Leilões</th><th>Categorias</th><th>Cadastro</th></tr></thead>
  <tbody>
    ${top10.map(p => `<tr><td class="nome">${esc(p.nome.split('(')[0].trim())}</td><td>${esc(p.uf || '—')}</td>
      <td class="num">${brl0(p.volumeCompra)}</td><td class="num">${num(p.lotes)}</td><td class="num">${num(p.leiloes)}</td>
      <td class="micro">${esc(p.categorias || '—')}</td>
      <td class="micro">${[p.cpf && 'CPF', p.telefone && 'tel', p.email && 'e-mail'].filter(Boolean).join(' · ') || '<span class="off">só o nome</span>'}</td></tr>`).join('')}
  </tbody>
</table>`

const geografia = `
<h2>Onde estão e o que compram</h2>
<div style="display:flex; gap:12px">
<div style="flex:1.15">
<h3>Por estado</h3>
<table>
  <thead><tr><th>UF</th><th class="r">Clientes</th><th class="r">Volume</th><th>Visual</th></tr></thead>
  <tbody>
    ${porUf.slice(0, 12).map(u => `<tr><td class="nome">${esc(u.k)}</td><td class="num">${num(u.n)}</td>
      <td class="num">${brl0(u.vgv)}</td><td><span class="bar" style="width:${Math.round(u.vgv / porUf[0].vgv * 70)}px"></span></td></tr>`).join('')}
  </tbody>
</table>
</div>
<div style="flex:1">
<h3>Por categoria comprada</h3>
<table>
  <thead><tr><th>Categoria</th><th class="r">Clientes</th><th>Visual</th></tr></thead>
  <tbody>
    ${categorias.map(c => `<tr><td class="nome">${esc(c.c)}</td><td class="num">${num(c.n)}</td>
      <td><span class="bar" style="width:${Math.round(c.n / categorias[0].n * 70)}px"></span></td></tr>`).join('')}
  </tbody>
</table>
<p class="micro">Deduzida do nome do leilão — o ERP não classifica o lote. ${num(base.length - base.filter(p => p.categorias).length)} clientes
ficam sem categoria porque compraram em evento de nome genérico.</p>
</div>
</div>

<h3>Por assessor</h3>
<table>
  <thead><tr><th>Assessor / pisteiro</th><th class="r">Clientes</th><th class="r">Volume</th><th class="r">Ticket médio</th><th>Visual</th></tr></thead>
  <tbody>
    ${porAssessor.filter(a => a.k !== '—').slice(0, 10).map(a => `<tr><td class="nome">${esc(a.k)}</td>
      <td class="num">${num(a.n)}</td><td class="num">${brl0(a.vgv)}</td><td class="num">${brl0(a.vgv / a.n)}</td>
      <td><span class="bar" style="width:${Math.round(a.vgv / porAssessor[0].vgv * 100)}px"></span></td></tr>`).join('')}
    ${porAssessor.filter(a => a.k === '—').map(a => `<tr><td class="nome off">sem assessor identificado</td>
      <td class="num">${num(a.n)}</td><td class="num">${brl0(a.vgv)}</td><td class="num">${brl0(a.vgv / a.n)}</td><td></td></tr>`).join('')}
  </tbody>
</table>
<p class="micro">O assessor aqui é o pisteiro que fechou o lote no ERP — é quem tocou a venda, e não necessariamente
quem detém o relacionamento. Um cliente pode aparecer em mais de um assessor no ano; a tabela conta o principal.</p>`

const relacionamento = `
<div class="pg"></div>
<h2>Relacionamento: o que a base diz sobre reativação</h2>
<table>
  <thead><tr><th>Grupo</th><th class="r">Clientes</th><th class="r">Volume 2026</th><th>O que fazer</th></tr></thead>
  <tbody>
    <tr><td class="nome">Recorrentes (2+ leilões)</td><td class="num">${num(recorrentes.length)}</td><td class="num">${brl0(soma(recorrentes, p => p.volumeCompra))}</td>
      <td>Núcleo da carteira: ${pct(soma(recorrentes, p => p.volumeCompra), VGV_BASE)} do volume com ${pct(recorrentes.length, base.length)} das pessoas. Merecem agenda nominal por leilão.</td></tr>
    <tr><td class="nome">Compraram uma vez só</td><td class="num">${num(base.length - recorrentes.length)}</td>
      <td class="num">${brl0(VGV_BASE - soma(recorrentes, p => p.volumeCompra))}</td>
      <td>Maior massa e maior oportunidade — mas ${num(base.filter(p => !p.recorrente && !p.telefone).length)} deles não têm telefone na base.</td></tr>
    <tr><td class="nome">Já foram abordados no WhatsApp</td><td class="num">${num(base.filter(p => p.abordadoWhatsapp).length)}</td>
      <td class="num">${brl0(soma(base.filter(p => p.abordadoWhatsapp), p => p.volumeCompra))}</td>
      <td>Quase ninguém: o atendimento por API oficial mirou leads novos, não a carteira que já compra.</td></tr>
    <tr><td class="nome">Vieram de campanha</td><td class="num">${num(base.filter(p => p.origemClasse === 'campanha').length)}</td>
      <td class="num">${brl0(soma(base.filter(p => p.origemClasse === 'campanha'), p => p.volumeCompra))}</td>
      <td>Detalhado no relatório de campanhas — só ${num(f.conversao.atribuiveis)} compraram depois de entrar como lead.</td></tr>
    <tr><td class="nome">Sem qualquer registro de lead</td><td class="num">${num(base.filter(p => !p.origemClasse).length)}</td>
      <td class="num">${brl0(soma(base.filter(p => !p.origemClasse), p => p.volumeCompra))}</td>
      <td>${pct(soma(base.filter(p => !p.origemClasse), p => p.volumeCompra), VGV_BASE)} do volume vem de gente que o marketing nunca tocou. É a carteira do assessor, pura.</td></tr>
  </tbody>
</table>

<h2>Encaminhamentos</h2>
<div class="box grey">
  <ul>
    <li><strong>Exigir CPF no ato do arremate.</strong> É a mudança de processo com maior efeito: destrava score,
      habilitação e unificação de nome de uma vez. Enquanto não for obrigatório no ERP, a base volta a furar todo mês.</li>
    <li><strong>Trabalhar a fila da aba A COMPLETAR</strong> (${num(semCadastro.length)} clientes,
      ${brl0(soma(semCadastro, p => p.volumeCompra))} comprados). Está ordenada por volume: os 20 primeiros já resolvem
      ${pct(soma(semCadastro.slice(0, 20), p => p.volumeCompra), soma(semCadastro, p => p.volumeCompra))} do valor sem cadastro.</li>
    <li><strong>Apontar a régua de WhatsApp também para quem já comprou.</strong> Hoje ela fala com lead novo;
      a carteira recorrente — a que sustenta o ano — quase não recebe toque estruturado.</li>
    <li><strong>Consultar score dos ${num(base.filter(p => p.cpf).length)} clientes que já têm CPF.</strong> Dá para
      fazer hoje, sem depender de nenhum cadastro novo, e responde qual parte da carteira aguenta parcelamento maior.</li>
  </ul>
</div>
<p class="micro">Fontes: HastaPro (ERP, filial Bula Assessoria — compradores, lotes, leilões, fazendas) ·
Supabase (clientes, crm_leads, bula_leilao_fechamento, bula_leilao_vendas, whatsapp_messages) · planilha
“Leads - Bula Assessoria” · listas por assessor em Desktop/BASE CLIENTES. Detalhe completo na planilha
<strong>Base-Clientes-Bula-2026.xlsx</strong>, aba a aba, com ${num(compras.length)} compras conferíveis.</p>
<footer><span>Bula Assessoria — Base de clientes 2026</span><span>Emitido em ${HOJE}</span></footer>`

const html = pagina('Base de clientes — Bula 2026',
    capa + cards + cadastro + concentracao + geografia + relacionamento)

fs.mkdirSync(saida, { recursive: true })
fs.writeFileSync(path.join(DIR, 'relatorio-base-clientes-2026.html'), html)
const pdfPath = path.join(saida, '2 - Base de Clientes Ativos - 2026.pdf')
await paraPdf(html, pdfPath)
console.log('PDF:', pdfPath)
