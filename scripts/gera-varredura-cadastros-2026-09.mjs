/**
 * RELATÓRIO — VARREDURA DOS GRUPOS DE CADASTRO × PLANILHA (aba CADASTROS)
 *
 *   node scripts/gera-varredura-cadastros-2026-09.mjs [pasta-de-saida]
 *
 * Pedido do chefe (08/09/2026): varrer os grupos de cadastro junto às
 * leiloeiras e apontar as incongruências contra a planilha do Drive — quem
 * está no grupo e não está na planilha, e vice-versa.
 *
 * Saída: PDF (leitura) + XLSX (trabalho) na Área de Trabalho.
 * Dados: scripts/lib/varredura-cadastros-2026-09.mjs
 *        outputs/varredura-cadastros-2026-09/planilha-linhas.json (a planilha lida)
 */
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { FICHAS, SO_NA_PLANILHA, DIVERGENCIAS } from './lib/varredura-cadastros-2026-09.mjs'
import { CSS, esc, dataBr, num, pct } from './lib/relatorio-2026-visual.mjs'
import { novoWorkbook, novaAba, cabecalho, bloco, tabela, nota, caixa, impressao } from './lib/xlsx-brand.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = process.argv[2] || path.join(homedir(), 'Desktop', 'Varredura Cadastros x Planilha (08-09-2026)')
fs.mkdirSync(SAIDA, { recursive: true })

const planilha = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', 'varredura-cadastros-2026-09', 'planilha-linhas.json'), 'utf8'))
    .filter(r => r.nome)

/* ── recortes ─────────────────────────────────────────────────────────────── */
const digitos = s => String(s || '').replace(/\D/g, '')
const chave = f => digitos(f.cpf || f.cnpj) || String(f.nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

const noGrupoENaPlanilha = FICHAS.filter(f => f.planilha)
const soNoGrupo = []
const vistos = new Set()
for (const f of FICHAS) {
    if (f.planilha) continue
    const k = chave(f)
    if (vistos.has(k)) continue
    vistos.add(k); soNoGrupo.push(f)
}
const APROVADO = v => v === 'aprovado' || v === 'ressalva'
const soNoGrupoAprovados = soNoGrupo.filter(f => APROVADO(f.veredito))
const soNoGrupoRecusados = soNoGrupo.filter(f => f.veredito === 'recusado')
const soNoGrupoPendentes = soNoGrupo.filter(f => f.veredito === 'pendente' || f.veredito === 'contraditório')
const anonimas = FICHAS.filter(f => /^\(sem nome/.test(f.nome))
const linhasCasadas = new Set(noGrupoENaPlanilha.map(f => f.planilha))

const porMes = {}
for (const f of FICHAS) (porMes[f.data.slice(0, 7)] ??= []).push(f)
const MESES = Object.keys(porMes).sort()

const vered = {}
for (const f of FICHAS) vered[f.veredito] = (vered[f.veredito] || 0) + 1

const GRP = { Remates: 'Bula Remates', Programa: 'Programa Leilões' }
const grupoTxt = g => g.split('+').map(x => GRP[x] || x).join(' + ')
const VER = { aprovado: 'Aprovado', ressalva: 'Aprovado c/ ressalva', recusado: 'Recusado', pendente: 'Sem resposta', 'contraditório': 'Contraditório' }

/* ── PDF ──────────────────────────────────────────────────────────────────── */
const linhaFicha = f => `<tr>
  <td class="num">${dataBr(f.data)}</td>
  <td class="nome">${esc(f.nome)}${f.cpf ? `<div class="micro">CPF ${esc(f.cpf)}${f.ie ? ` · I.E. ${esc(f.ie)}` : ''}</div>` : (f.cnpj ? `<div class="micro">CNPJ ${esc(f.cnpj)}</div>` : '')}</td>
  <td>${esc(f.uf || '—')}</td>
  <td>${esc(grupoTxt(f.grupo))}</td>
  <td>${esc(f.quem || '—')}</td>
  <td><b>${VER[f.veredito]}</b></td>
  <td class="micro">${esc(f.ev)}</td>
</tr>`

const tabelaFichas = lista => `<table><thead><tr>
  <th style="width:15mm">Data</th><th style="width:44mm">Cliente</th><th style="width:8mm">UF</th>
  <th style="width:26mm">Grupo</th><th style="width:24mm">Quem levou</th><th style="width:22mm">Veredito</th><th>Evidência (frase do grupo)</th>
</tr></thead><tbody>${lista.map(linhaFicha).join('')}</tbody></table>`

const corpo = `
<div class="cap">
  <div>
    <h1>Varredura dos grupos de cadastro<br>× planilha "Leads — Bula Assessoria"</h1>
    <div class="sub">Todas as fichas e consultas de cadastro que passaram pelos grupos das leiloeiras entre <b>10/06/2026</b> e <b>08/09/2026</b>, cruzadas linha a linha com a aba <b>CADASTROS</b> da planilha do Drive.</div>
  </div>
  <div class="meta">
    <div class="tot">${FICHAS.length}<small>fichas nos grupos</small></div>
    <div style="margin-top:6px">Apurado em 08/09/2026<br>Bula Assessoria · Tecnologia</div>
  </div>
</div>

<div class="cards">
  <div class="card"><div class="z">Planilha CADASTROS</div><div class="n">${planilha.length}<small>linhas (1 é duplicata)</small></div></div>
  <div class="card"><div class="z">Batem nas duas fontes</div><div class="n">${linhasCasadas.size}<small>linhas com ficha no grupo</small></div></div>
  <div class="card"><div class="z">Só na planilha</div><div class="n">${SO_NA_PLANILHA.length}<small>sem ficha no grupo</small></div></div>
  <div class="card"><div class="z">Só no grupo</div><div class="n">${soNoGrupo.length}<small>pessoas fora da planilha</small></div></div>
  <div class="card"><div class="z">Divergem no conteúdo</div><div class="n">${DIVERGENCIAS.length}<small>CPF, nome, data, veredito</small></div></div>
</div>

<div class="box alerta">
  <h3>A conclusão em uma frase</h3>
  <p><b>As duas fontes descrevem operações diferentes.</b> A planilha tem ${planilha.length} linhas e os grupos têm ${FICHAS.length} fichas — mas só <b>${linhasCasadas.size} linhas da planilha</b> (${pct(linhasCasadas.size, planilha.length)}) têm uma ficha correspondente no grupo. Os grupos carregam <b>${soNoGrupo.length} pessoas que a planilha nunca viu</b>, das quais <b>${soNoGrupoAprovados.length} foram aprovadas</b> pela leiloeira — cliente habilitado que não está em lugar nenhum do controle. E ${SO_NA_PLANILHA.length} linhas da planilha estão marcadas como cadastradas em uma ou mais leiloeiras sem nenhuma submissão registrada.</p>
</div>

<h2>1 · O que foi varrido</h2>
<table><thead><tr><th style="width:52mm">Fonte</th><th style="width:30mm">Período</th><th class="r" style="width:20mm">Volume</th><th>Observação</th></tr></thead><tbody>
<tr><td class="nome">Grupo "Cadastros Bula Remates"</td><td>10/06/2026 → 08/09/2026</td><td class="num">1.163 msgs</td><td>Criado em 10/06. É o grupo com a Bula Remates (Matheus Eberts e Guilherme Galassi na consulta).</td></tr>
<tr><td class="nome">Grupo "Cadastros Bula e Programa"</td><td>07/07/2026 → 08/09/2026</td><td class="num">694 msgs</td><td>Criado em 07/07 pelo Marcelo com a Márcia. Márcia, Sendy, Juliane e Ana respondem os vereditos.</td></tr>
<tr><td class="nome">Grupo "PARCERIA BULA e ERURAL"</td><td>23/01/2026 → 01/09/2026</td><td class="num">45 msgs</td><td><b>Não existe grupo de cadastro da eRural.</b> Esse grupo trata de agenda, flyers e catálogos. A coluna E-RURAL da planilha não tem fonte de conferência.</td></tr>
<tr><td class="nome">Anexos do bucket whatsapp-media</td><td>24/07/2026 → 08/09/2026</td><td class="num">166 arquivos</td><td>Abertos um a um. Foi assim que ${anonimas.length > 0 ? 'boa parte das' : ''} fichas sem nome no texto ganharam nome — na maioria o texto do grupo é só "consulta por favor".</td></tr>
<tr><td class="nome">Planilha (gid 840723412)</td><td>abr → set/2026</td><td class="num">${planilha.length} linhas</td><td>Colunas DIA, MÊS, SDR, Assessor, Já comprou?, Nome, Interesse, Telefone, Cidade, Estado, CPF, IE, SCORE, PENDÊNCIAS, BULA REMATES, E-RURAL, PROGRAMA, CAMPANHA.</td></tr>
</tbody></table>

<div class="box grey">
  <h3>Um limite que precisa ser dito</h3>
  <p>A captura de anexos só começou em <b>24/07/2026</b>. Os <b>193 documentos e fotos de junho e da primeira metade de julho não existem em lugar nenhum</b> — só o texto da conversa foi recuperado (dos history-dumps do servidor). Por isso ${anonimas.length} fichas do relatório aparecem como "(sem nome no texto)": o cliente ia dentro do anexo. Todas as demais estão nomeadas.</p>
</div>

<h2>2 · O placar da conferência</h2>
<table><thead><tr><th>Situação</th><th class="r" style="width:18mm">Qtd.</th><th>O que significa</th></tr></thead><tbody>
<tr><td class="nome">Linha da planilha COM ficha no grupo</td><td class="num">${linhasCasadas.size}</td><td>Os dois lados enxergam a mesma pessoa. É a parte saudável do processo.</td></tr>
<tr><td class="nome">Linha da planilha SEM ficha no grupo</td><td class="num">${SO_NA_PLANILHA.length}</td><td>Marcadas como cadastradas, sem nenhuma submissão registrada nos grupos — ver seção 3.</td></tr>
<tr><td class="nome">Pessoa no grupo SEM linha na planilha</td><td class="num">${soNoGrupo.length}</td><td>Passou pela consulta e ficou fora do controle — ver seção 4.</td></tr>
<tr><td class="nome">— destas, <b>aprovadas</b> pela leiloeira</td><td class="num">${soNoGrupoAprovados.length}</td><td><b>Cliente habilitado que não está na planilha.</b> É o buraco que mais custa dinheiro.</td></tr>
<tr><td class="nome">— destas, recusadas</td><td class="num">${soNoGrupoRecusados.length}</td><td>Recusa que ninguém registrou: o mesmo nome pode voltar e queimar tempo de novo.</td></tr>
<tr><td class="nome">— destas, sem resposta / contraditórias</td><td class="num">${soNoGrupoPendentes.length}</td><td>Ficha postada e esquecida. Nenhuma cobrança foi feita.</td></tr>
<tr><td class="nome">Divergência de conteúdo</td><td class="num">${DIVERGENCIAS.length}</td><td>CPF com dígito a mais, nome trocado, data errada, veredito contrário — ver seção 5.</td></tr>
</tbody></table>

<div class="pg"></div>
<h3>Como as fichas se distribuem no tempo</h3>
<table><thead><tr><th style="width:24mm">Mês</th><th class="r" style="width:18mm">Fichas</th><th class="r" style="width:20mm">Aprovadas</th><th class="r" style="width:20mm">Recusadas</th><th class="r" style="width:22mm">Sem resposta</th><th>Leitura</th></tr></thead><tbody>
${MESES.map(m => {
    const l = porMes[m]
    const a = l.filter(f => APROVADO(f.veredito)).length
    const r = l.filter(f => f.veredito === 'recusado').length
    const p = l.filter(f => f.veredito === 'pendente' || f.veredito === 'contraditório').length
    const leitura = {
        '2026-06': 'Mês inteiro fora da planilha em boa parte: o grupo nasceu em 10/06 e o registro só começou depois.',
        '2026-07': 'O pico. 25 fichas saíram de uma vez pela automação em 10/07 e 15 delas nunca receberam resposta.',
        '2026-08': 'Operação mais organizada, mas ainda 1 em cada 4 fichas fica sem veredito.',
        '2026-09': 'Oito dias de mês: a Luana e o Pedro concentram as consultas e a taxa de aprovação é alta.',
    }[m] || ''
    return `<tr><td class="nome">${dataBr(m + '-01').slice(3)}</td><td class="num">${l.length}</td><td class="num">${a}</td><td class="num">${r}</td><td class="num">${p}</td><td class="micro">${esc(leitura)}</td></tr>`
}).join('')}
<tr><td class="nome"><b>Total</b></td><td class="num"><b>${FICHAS.length}</b></td><td class="num"><b>${vered.aprovado + vered.ressalva}</b></td><td class="num"><b>${vered.recusado}</b></td><td class="num"><b>${vered.pendente + vered['contraditório']}</b></td><td></td></tr>
</tbody></table>

<h2>3 · Está na planilha e NÃO está no grupo — ${SO_NA_PLANILHA.length} linhas</h2>
<p>Linhas marcadas com ✓ em uma ou mais leiloeiras, sem nenhuma ficha, consulta ou menção nos dois grupos de cadastro. Onde havia registro no banco (o backfill em lote de 08/07/2026), está dito — mas backfill é importação de planilha, <b>não é aprovação da leiloeira</b>.</p>
<table><thead><tr><th style="width:9mm">Lin.</th><th style="width:44mm">Nome na planilha</th><th style="width:13mm">Data</th><th style="width:24mm">SDR / Assessor</th><th style="width:28mm">CPF</th><th style="width:34mm">Marcado como cadastrado em</th><th>O que se sabe</th></tr></thead><tbody>
${SO_NA_PLANILHA.map(r => `<tr><td class="num">${r.linha}</td><td class="nome">${esc(r.nome)}</td><td class="num">${esc(r.data)}</td><td class="micro">${esc(r.sdr)}<br>${esc(r.assessor || '—')}</td><td class="num">${esc(r.cpf || '—')}${r.uf ? `<div class="micro">${esc(r.uf)}</div>` : ''}</td><td class="micro">${esc(r.marcado)}</td><td class="micro">${esc(r.obs)}</td></tr>`).join('')}
</tbody></table>

<div class="box">
  <h3>O que salta aos olhos aqui</h3>
  <ul>
    <li><b>Sete linhas de abril e maio</b> (Orismar, Wilkson, Romualdo, Dayse, Marco Aurelio, Raphael Henrique, Neusivan) estão marcadas como cadastradas nas três leiloeiras e são anteriores à existência dos grupos — o cadastro delas, se houve, foi por e-mail ou telefone e não deixou registro nenhum.</li>
    <li><b>Seis linhas vêm do backfill de 08/07</b> (Marcelo Oliveira, Adeildo, Deiglames, Carlos Fernando, Marcelo Clemente, Maxwell). Foram importadas já marcadas "aprovado", sem <i>decidido_at</i> — ninguém da leiloeira disse sim.</li>
    <li><b>Pablo Pinheiro Costa e Dirceu de Oliveira Valente</b> aparecem no grupo uma única vez: dentro da mensagem de <i>teste</i> da automação em 23/06 ("Só teste. O crm e o servidor de whatsapp conseguem comunicar com o grupo"). Não é ficha.</li>
    <li><b>Trajano</b> (linha 11) está marcado ✓ na Bula Remates e na eRural com só um primeiro nome, sem CPF e sem cidade. Não há como conferir.</li>
    <li><b>Leonardo de Oliveira ocupa duas linhas</b> (9 e 44) com o mesmo CPF e o mesmo telefone. Qualquer contagem da aba está inflada em 1.</li>
  </ul>
</div>

<h2>4 · Está no grupo e NÃO está na planilha — ${soNoGrupo.length} pessoas</h2>
<p>Este é o lado grande da incongruência. São pessoas cujo cadastro foi efetivamente trabalhado com a leiloeira — muitas com documento anexado, score consultado e veredito dado — e que <b>não têm linha na aba CADASTROS</b>.</p>

<h3>4.1 · Aprovadas pela leiloeira e fora da planilha — ${soNoGrupoAprovados.length} pessoas</h3>
<p class="micro">Inclui aprovação com ressalva (limite de lote ou de valor), que para o comercial é aprovação.</p>
${tabelaFichas(soNoGrupoAprovados)}

<div class="pg"></div>
<h3>4.2 · Recusadas pela leiloeira e fora da planilha — ${soNoGrupoRecusados.length} pessoas</h3>
<p class="micro">Sem esse registro, o mesmo nome volta ao grupo semanas depois e a equipe refaz o trabalho. Já aconteceu com a Dienifer (recusada em 10/07 e reapresentada em 01/08) e com o Tiago Menezes Esposti (recusado duas vezes, por pessoas diferentes da leiloeira).</p>
${tabelaFichas(soNoGrupoRecusados)}

<div class="pg"></div>
<h3>4.3 · Sem resposta da leiloeira ou com veredito contraditório — ${soNoGrupoPendentes.length} pessoas</h3>
<p class="micro">Ficha postada no grupo e nunca respondida. Ninguém cobrou — e ninguém sabe, porque não há onde olhar.</p>
${tabelaFichas(soNoGrupoPendentes)}

<div class="pg"></div>
<h2>5 · Divergências de conteúdo — ${DIVERGENCIAS.length} casos</h2>
<p>Aqui a pessoa está nas duas fontes, mas o dado não bate. São os erros que quebram qualquer conferência automática futura.</p>
<table><thead><tr><th style="width:26mm">Tipo</th><th style="width:9mm">Lin.</th><th style="width:38mm">Cliente</th><th style="width:44mm">Na planilha</th><th style="width:48mm">No grupo</th><th>Nota</th></tr></thead><tbody>
${DIVERGENCIAS.map(d => `<tr><td class="nome">${esc(d.tipo)}</td><td class="num">${d.linha}</td><td>${esc(d.nome)}</td><td class="micro">${esc(d.planilha)}</td><td class="micro">${esc(d.grupo)}</td><td class="micro">${esc(d.nota)}</td></tr>`).join('')}
</tbody></table>

<h2>6 · Por que isso acontece — e o que resolve</h2>
<div class="box alerta">
  <h3>A causa, em três camadas</h3>
  <ul>
    <li><b>O sistema só fecha o ciclo para ficha que ele mesmo postou.</b> O parser em <code>src/lib/leiloeira-whatsapp-cadastro.ts</code> casa a resposta "aprovado/recusado" contra um código <code>#CAD</code>. A equipe posta à mão, sem código — então nada volta para o banco. Das ${FICHAS.length} fichas, só ${FICHAS.filter(f => /sistema/.test(String(f.quem))).length} nasceram do sistema, e mesmo essas pararam em 12/07.</li>
    <li><b>A planilha é preenchida por quem atendeu, não por quem recebeu o veredito.</b> Por isso ela adianta (marca ✓ antes da leiloeira responder) e atrasa (não registra a aprovação que veio depois) — os dois sentidos aparecem nesta apuração.</li>
    <li><b>A coluna E-RURAL não tem lastro nenhum.</b> Não existe grupo de cadastro da eRural: o único grupo com eles trata de agenda e flyers. Todo ✓ nessa coluna hoje é declaração, não confirmação.</li>
  </ul>
</div>
<div class="box">
  <h3>O que dá para fazer sem mexer em nada do processo do comercial</h3>
  <ul>
    <li><b>Completar as ${DIVERGENCIAS.filter(d => d.tipo === 'Campo vazio').length} linhas com CPF em branco</b> usando o que já está nos anexos: Mauro, José Antônio, Aristela, Antônio e Claudio têm CPF, cidade e I.E. identificados neste relatório.</li>
    <li><b>Corrigir os 4 CPFs inválidos</b> (Ivana, Rodrigo, Derek, Juliano). Com dígito a mais ou separador errado, nenhuma conferência automática vai casar nunca.</li>
    <li><b>Apagar a duplicata da linha 44</b> (Leonardo de Oliveira) e decidir o que fazer com Trajano e Neusivan, que só têm primeiro nome.</li>
    <li><b>Lançar na planilha as ${soNoGrupoAprovados.length} pessoas aprovadas que estão fora dela.</b> São clientes habilitados hoje — vender para eles não depende de mais nenhuma etapa.</li>
    <li><b>Cobrar os ${soNoGrupoPendentes.length} sem resposta.</b> Quinze deles são de 10/07, do lote da automação, e continuam em aberto há dois meses.</li>
    <li><b>Registrar recusa também.</b> Hoje a recusa só existe na conversa; é ela que evita retrabalho e evita levar de volta um nome já barrado.</li>
  </ul>
</div>

<div class="pg"></div>
<h2>Anexo · Todas as ${FICHAS.length} fichas, em ordem de data</h2>
<p class="micro">Coluna "Linha" indica a linha correspondente na aba CADASTROS — em branco quer dizer que a pessoa não está na planilha.</p>
<table><thead><tr>
  <th style="width:15mm">Data</th><th style="width:8mm">Lin.</th><th style="width:42mm">Cliente</th><th style="width:7mm">UF</th>
  <th style="width:24mm">Grupo</th><th style="width:22mm">Quem levou</th><th style="width:20mm">Veredito</th><th>Evidência</th>
</tr></thead><tbody>
${FICHAS.map(f => `<tr>
  <td class="num">${dataBr(f.data)}</td>
  <td class="num">${f.planilha || ''}</td>
  <td class="nome">${esc(f.nome)}${f.cpf ? `<div class="micro">CPF ${esc(f.cpf)}${f.ie ? ` · I.E. ${esc(f.ie)}` : ''}</div>` : (f.cnpj ? `<div class="micro">CNPJ ${esc(f.cnpj)}</div>` : '')}</td>
  <td>${esc(f.uf || '—')}</td>
  <td class="micro">${esc(grupoTxt(f.grupo))}</td>
  <td class="micro">${esc(f.quem || '—')}</td>
  <td><b>${VER[f.veredito]}</b>${f.leilao ? `<div class="micro">${esc(f.leilao)}</div>` : ''}</td>
  <td class="micro">${esc(f.ev)}</td>
</tr>`).join('')}
</tbody></table>

<footer><span>Bula Assessoria · Varredura dos grupos de cadastro × planilha CADASTROS</span><span>Apurado em 08/09/2026 · ${FICHAS.length} fichas · ${planilha.length} linhas de planilha</span></footer>
`

// O relatório é quase todo tabela longa: o rodapé fixo precisa de folga maior
// que a do padrão, senão ele deita sobre as últimas linhas de cada página.
const EXTRA = `
  @page { size: A4; margin: 13mm 11mm 19mm; }
  body { padding-bottom: 0; }
  footer { bottom: 7mm; }
  h2, h3 { break-after: avoid; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
`
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Varredura Cadastros x Planilha</title><style>${CSS}${EXTRA}</style></head><body>${corpo}</body></html>`
const arqHtml = path.join(SAIDA, 'Varredura-Cadastros-x-Planilha-2026-09-08.html')
fs.writeFileSync(arqHtml, html)

const { chromium } = await import('playwright')
const navegador = await chromium.launch()
try {
    const pag = await navegador.newPage()
    await pag.setContent(html, { waitUntil: 'networkidle' })
    await pag.pdf({ path: path.join(SAIDA, 'Varredura-Cadastros-x-Planilha-2026-09-08.pdf'), format: 'A4', printBackground: true })
} finally { await navegador.close() }

/* ── XLSX ─────────────────────────────────────────────────────────────────── */
const wb = novoWorkbook('Varredura Cadastros × Planilha — 08/09/2026')

// Aba 1 — Resumo
{
    const ws = novaAba(wb, 'Resumo')
    let l = cabecalho(ws, 'Varredura dos grupos de cadastro × planilha CADASTROS', 'Grupos Bula Remates e Bula+Programa · 10/06/2026 a 08/09/2026 · apurado em 08/09/2026', 4)
    l = bloco(ws, l, 'Placar', 4)
    l = tabela(ws, l, [
        { t: 'Situação', k: 'sit', w: 46 }, { t: 'Qtd.', k: 'q', w: 10, al: 'r', fmt: '#,##0' }, { t: 'O que significa', k: 'o', w: 72 },
    ], [
        { sit: 'Linhas da planilha CADASTROS', q: planilha.length, o: 'Uma delas (linha 44) é duplicata da linha 9.' },
        { sit: 'Fichas/consultas nos grupos', q: FICHAS.length, o: `${anonimas.length} sem nome identificável (anexo de junho/julho não recuperável).` },
        { sit: 'Linha da planilha COM ficha no grupo', q: linhasCasadas.size, o: 'A parte que bate.' },
        { sit: 'Linha da planilha SEM ficha no grupo', q: SO_NA_PLANILHA.length, o: 'Marcada como cadastrada sem submissão registrada.', __destaque: true },
        { sit: 'Pessoa no grupo SEM linha na planilha', q: soNoGrupo.length, o: 'Fora do controle.', __destaque: true },
        { sit: '— destas, aprovadas pela leiloeira', q: soNoGrupoAprovados.length, o: 'Cliente habilitado que não está na planilha.', __cor: 'verde' },
        { sit: '— destas, recusadas', q: soNoGrupoRecusados.length, o: 'Recusa não registrada gera retrabalho.', __cor: 'vermelho' },
        { sit: '— destas, sem resposta / contraditórias', q: soNoGrupoPendentes.length, o: 'Ficha postada e esquecida.' },
        { sit: 'Divergências de conteúdo', q: DIVERGENCIAS.length, o: 'CPF, nome, data ou veredito não batem.' },
    ], { congela: false, filtro: false })
    l++
    l = bloco(ws, l, 'Fichas por mês', 4)
    l = tabela(ws, l, [
        { t: 'Mês', k: 'm', w: 46 }, { t: 'Fichas', k: 'f', w: 10, al: 'r', fmt: '#,##0' }, { t: 'Aprovadas / recusadas / sem resposta', k: 'd', w: 72 },
    ], MESES.map(m => {
        const x = porMes[m]
        return { m: dataBr(m + '-01').slice(3), f: x.length, d: `${x.filter(f => APROVADO(f.veredito)).length} aprovadas · ${x.filter(f => f.veredito === 'recusado').length} recusadas · ${x.filter(f => f.veredito === 'pendente' || f.veredito === 'contraditório').length} sem resposta` }
    }), { larguras: false, congela: false, filtro: false })
    l++
    l = caixa(ws, l, 'Limite conhecido desta apuração', 'A captura de anexos no bucket só começou em 24/07/2026. Os 193 documentos e fotos de junho e da primeira metade de julho não existem em lugar nenhum — só o texto da conversa foi recuperado dos history-dumps do servidor. Por isso algumas fichas aparecem como "(sem nome no texto)". Não existe grupo de cadastro da eRural: o único grupo com eles trata de agenda e flyers, então a coluna E-RURAL da planilha não tem fonte de conferência.', 4)
    impressao(ws, { paisagem: false })
}

// Aba 2 — Só na planilha
{
    const ws = novaAba(wb, 'So na planilha')
    let l = cabecalho(ws, 'Está na planilha e não está no grupo', `${SO_NA_PLANILHA.length} linhas marcadas como cadastradas sem nenhuma ficha registrada nos grupos`, 7)
    l = tabela(ws, l, [
        { t: 'Linha', k: 'linha', w: 7, al: 'c' }, { t: 'Nome na planilha', k: 'nome', w: 34 }, { t: 'Data', k: 'data', w: 9, al: 'c' },
        { t: 'SDR', k: 'sdr', w: 18 }, { t: 'Assessor', k: 'assessor', w: 18 }, { t: 'CPF', k: 'cpf', w: 17 },
        { t: 'UF', k: 'uf', w: 8 }, { t: 'Marcado como cadastrado em', k: 'marcado', w: 32 }, { t: 'O que se sabe', k: 'obs', w: 70 },
    ], SO_NA_PLANILHA, { congelaCol: 2 })
    impressao(ws, { repetir: `${l}:${l}` })
}

// Aba 3 — Só no grupo
{
    const ws = novaAba(wb, 'So no grupo')
    let l = cabecalho(ws, 'Está no grupo e não está na planilha', `${soNoGrupo.length} pessoas passaram pela consulta de cadastro e não têm linha na aba CADASTROS`, 8)
    l = tabela(ws, l, [
        { t: 'Data', k: 'd', w: 11, al: 'c' }, { t: 'Cliente', k: 'nome', w: 36 }, { t: 'CPF / CNPJ', k: 'doc', w: 18 },
        { t: 'I.E.', k: 'ie', w: 16 }, { t: 'UF', k: 'uf', w: 7, al: 'c' }, { t: 'Grupo', k: 'g', w: 24 },
        { t: 'Quem levou', k: 'quem', w: 22 }, { t: 'Veredito', k: 'v', w: 18 }, { t: 'Leilão', k: 'leilao', w: 20 },
        { t: 'Evidência (frase do grupo)', k: 'ev', w: 80 },
    ], soNoGrupo.map(f => ({
        d: dataBr(f.data), nome: f.nome, doc: f.cpf || f.cnpj || '', ie: f.ie || '', uf: f.uf || '',
        g: grupoTxt(f.grupo), quem: f.quem || '', v: VER[f.veredito], leilao: f.leilao || '', ev: f.ev,
        __cor: APROVADO(f.veredito) ? 'verde' : (f.veredito === 'recusado' ? 'vermelho' : undefined),
    })), { congelaCol: 2 })
    impressao(ws, { repetir: `${l}:${l}` })
}

// Aba 4 — Divergências
{
    const ws = novaAba(wb, 'Divergencias')
    let l = cabecalho(ws, 'Divergências de conteúdo', 'A pessoa está nas duas fontes, mas o dado não bate', 6)
    l = tabela(ws, l, [
        { t: 'Tipo', k: 'tipo', w: 20 }, { t: 'Linha', k: 'linha', w: 7, al: 'c' }, { t: 'Cliente', k: 'nome', w: 32 },
        { t: 'Na planilha', k: 'planilha', w: 40 }, { t: 'No grupo', k: 'grupo', w: 52 }, { t: 'Nota', k: 'nota', w: 66 },
    ], DIVERGENCIAS, { congelaCol: 3 })
    impressao(ws, { repetir: `${l}:${l}` })
}

// Aba 5 — Todas as fichas
{
    const ws = novaAba(wb, 'Fichas nos grupos')
    let l = cabecalho(ws, `Todas as ${FICHAS.length} fichas e consultas dos grupos`, '10/06/2026 a 08/09/2026, em ordem de data. "Linha" = linha correspondente na aba CADASTROS', 9)
    l = tabela(ws, l, [
        { t: 'Data', k: 'd', w: 11, al: 'c' }, { t: 'Linha planilha', k: 'p', w: 9, al: 'c' }, { t: 'Cliente', k: 'nome', w: 36 },
        { t: 'CPF / CNPJ', k: 'doc', w: 18 }, { t: 'I.E.', k: 'ie', w: 16 }, { t: 'UF', k: 'uf', w: 7, al: 'c' },
        { t: 'Grupo', k: 'g', w: 24 }, { t: 'Quem levou', k: 'quem', w: 22 }, { t: 'Veredito', k: 'v', w: 18 },
        { t: 'Leilão', k: 'leilao', w: 20 }, { t: 'Evidência (frase do grupo)', k: 'ev', w: 80 },
    ], FICHAS.map(f => ({
        d: dataBr(f.data), p: f.planilha || '', nome: f.nome, doc: f.cpf || f.cnpj || '', ie: f.ie || '', uf: f.uf || '',
        g: grupoTxt(f.grupo), quem: f.quem || '', v: VER[f.veredito], leilao: f.leilao || '', ev: f.ev,
        __destaque: !f.planilha && APROVADO(f.veredito),
    })), { congelaCol: 3 })
    impressao(ws, { repetir: `${l}:${l}` })
}

// Aba 6 — A planilha como está
{
    const ws = novaAba(wb, 'Planilha CADASTROS')
    let l = cabecalho(ws, 'A aba CADASTROS como está hoje', `${planilha.length} linhas · coluna "No grupo?" diz se a pessoa foi encontrada nos grupos`, 10)
    l = tabela(ws, l, [
        { t: 'Linha', k: 'linha', w: 7, al: 'c' }, { t: 'DIA', k: 'dia', w: 6, al: 'c' }, { t: 'MÊS', k: 'mes', w: 6, al: 'c' },
        { t: 'SDR', k: 'sdr', w: 18 }, { t: 'Assessor', k: 'assessor', w: 18 }, { t: 'Já comprou?', k: 'jacomprou', w: 12, al: 'c' },
        { t: 'Nome completo', k: 'nome', w: 34 }, { t: 'Interesse', k: 'interesse', w: 15 }, { t: 'Telefone', k: 'tel', w: 16 },
        { t: 'Cidade', k: 'cidade', w: 18 }, { t: 'UF', k: 'uf', w: 6, al: 'c' }, { t: 'CPF', k: 'cpf', w: 17 },
        { t: 'I.E.?', k: 'ie', w: 7, al: 'c' }, { t: 'Score', k: 'score', w: 8, al: 'c' }, { t: 'Pend.', k: 'pend', w: 8, al: 'c' },
        { t: 'Bula Remates', k: 'remates', w: 12, al: 'c' }, { t: 'e-Rural', k: 'erural', w: 10, al: 'c' }, { t: 'Programa', k: 'programa', w: 11, al: 'c' },
        { t: 'Campanha', k: 'campanha', w: 30 }, { t: 'No grupo?', k: 'nogrupo', w: 34 },
    ], planilha.map(r => {
        const casou = linhasCasadas.has(r.linha)
        const f = FICHAS.find(x => x.planilha === r.linha)
        return {
            ...r,
            nogrupo: casou ? `SIM — ficha de ${dataBr(f.data)} (${VER[f.veredito]})` : 'NÃO — sem ficha nos grupos',
            __cor: casou ? 'verde' : 'vermelho',
        }
    }), { congelaCol: 1 })
    impressao(ws, { repetir: `${l}:${l}` })
}

await wb.xlsx.writeFile(path.join(SAIDA, 'Varredura-Cadastros-x-Planilha-2026-09-08.xlsx'))

console.log('OK →', SAIDA)
console.log(' · PDF  Varredura-Cadastros-x-Planilha-2026-09-08.pdf')
console.log(' · XLSX Varredura-Cadastros-x-Planilha-2026-09-08.xlsx')
console.log(` · ${FICHAS.length} fichas · ${planilha.length} linhas de planilha · ${linhasCasadas.size} batem · ${SO_NA_PLANILHA.length} só na planilha · ${soNoGrupo.length} só no grupo`)
