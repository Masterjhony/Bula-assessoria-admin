/**
 * DESEMPENHO OPERACIONAL — CAMPANHAS ATIVAS EM AGOSTO/2026.
 *
 *   node scripts/gera-relatorio-operacional-campanhas-2026-08.mjs [pasta-de-saida]
 *
 * RECORTE (pedido do João, 26/08): só o universo de leads das campanhas que
 * veicularam em agosto — LEAD - PERPETUO TOURO, LEADS - PERPETUO FEMEAS,
 * LEADS - Expogenética e LEADS - SAO GERALDO — cada uma com a landing que
 * atende a mesma oferta. Campanha encerrada antes de agosto (EAO, MAGDA,
 * PERPETUO antigo, JMP) fica de fora, mesmo que um lead dela tenha virado
 * cadastro no mês: o que está sendo medido é a operação DESTAS campanhas.
 *
 * O universo é a pessoa, não a linha: quem preencheu dois formulários conta uma
 * vez, pela primeira data. Duas campanhas (TOURO e SÃO GERALDO) começaram no
 * fim de julho, então o universo tem lead de julho — está declarado em toda
 * tabela, e o recorte "chegou em agosto" aparece ao lado.
 *
 * A submissão de cadastro tem DOIS estados neste relatório, e eles não são a
 * mesma coisa:
 *   • DECLARADA  — a equipe marcou CADASTRO OK na planilha (17 em agosto).
 *   • COMPROVADA — existe ficha no grupo da leiloeira, com o cliente
 *                  identificado e casado com o lead (10 em agosto).
 * A diferença é o assunto do relatório, não um detalhe de rodapé.
 *
 * ⚠ AS FICHAS VÃO COMO ANEXO. Boa parte das submissões chega ao grupo como
 * "consulta por favor" + CNH/inscrição em PDF ou foto. Contar só o texto
 * subestima: na primeira passada este relatório achou 4 submissões de campanha,
 * e abrindo os 68 anexos de agosto apareceram 10. A identificação de cada uma
 * está em scripts/lib/cadastros-agosto-2026.mjs, com o documento que a prova.
 *
 * Quem postou a ficha também classifica: Douglas, Marcelo, Pedro, Luana e João
 * Antônio são marketing (ficha nasce de lead); Fábio Omena e Leonardo Serafim
 * são assessores comerciais (carteira própria).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { CADASTROS_AGOSTO, EQUIPE_MARKETING } from './lib/cadastros-agosto-2026.mjs'
import { indexaUniverso, casaNoUniverso, provaDe, nomeNorm, foneKey } from './lib/origem-cadastros-2026.mjs'
import { pagina, paraPdf, esc, brl, brl0, num, pct, dataBr } from './lib/relatorio-2026-visual.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const F = path.join(ROOT, 'outputs', 'base-clientes-2026', 'fontes')
const saida = process.argv[2] || path.join(ROOT, 'outputs', 'operacional-campanhas-2026-08')
fs.mkdirSync(saida, { recursive: true })
const HOJE = '26/08/2026'

/* ── as campanhas que veicularam em agosto ────────────────────────────────── */
const CAMPANHAS = [
    { id: '120249455058620708', nome: 'LEAD - PERPETUO TOURO', curto: 'Perpétuo Touro', desde: '2026-07-24', origens: ['Meta — LEAD - PERPETUO TOURO', 'Landing Touros'] },
    { id: '120249845218920708', nome: 'LEADS - PERPETUO FEMEAS', curto: 'Perpétuo Fêmeas', desde: '2026-08-11', origens: ['Meta — LEADS - PERPETUO FEMEAS', 'Landing Fêmeas — Funil Perpétuo'] },
    { id: '120249975819240708', nome: 'LEADS - Expogenética', curto: 'Expogenética', desde: '2026-08-17', origens: ['Meta — LEADS - Expogenética'] },
    { id: '120249560579230708', nome: 'LEADS - SAO GERALDO', curto: 'São Geraldo', desde: '2026-07-29', origens: ['Meta — LEADS - SAO GERALDO', 'Landing São Geraldo'] },
]
const daOrigem = new Map()
for (const c of CAMPANHAS) for (const o of c.origens) daOrigem.set(o, c)

/* ── mídia ────────────────────────────────────────────────────────────────── */
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', 'funil-campanhas-2026', 'meta-estrutura-2026-08-26.json'), 'utf8'))
const campMeta = new Map(meta.campanhas.map(c => [c.id, c]))
const mensal = meta.mensal
const midiaDe = id => ({ vida: campMeta.get(id), agosto: mensal[id]?.['2026-08'] || null })
const totalAgosto = CAMPANHAS.reduce((s, c) => s + (midiaDe(c.id).agosto?.investido || 0), 0)
const totalVida = CAMPANHAS.reduce((s, c) => s + (campMeta.get(c.id)?.investido || 0), 0)

/* ── universo de leads ────────────────────────────────────────────────────── */
const planilha = JSON.parse(fs.readFileSync(path.join(F, 'planilha-leads.json'), 'utf8'))
const abas = {}
for (const [aba, { head, rows }] of Object.entries(planilha)) abas[aba] = rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
const iso = d => { const m = String(d).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : '' }
const ehTeste = r => /teste|test lead|dummy/i.test(String(r['Nome'] || ''))

const linhas = abas['LEADS GERAIS'].filter(r => daOrigem.has(String(r['Origem'])) && !ehTeste(r))
const porPessoa = new Map()
for (const r of linhas) {
    const k = foneKey(r['WhatsApp']) || nomeNorm(r['Nome'])
    const ja = porPessoa.get(k)
    if (!ja || iso(r['Data']) < iso(ja['Data'])) porPessoa.set(k, r)
}
const leads = [...porPessoa.values()]
const duplicadas = linhas.length - leads.length

/* etapa da equipe (as abas de interesse são a fonte) */
const PESO = { 'NUMERO ERRADO': 1, 'NÃO RESPONDEU': 2, 'CONEXÃO': 3, 'QUALIFICAÇÃO': 4, 'SEM INFORMAÇÃO PARA CADASTRO': 5, 'CADASTRO REPROVADO': 6, 'CADASTRO OK': 7, 'JÁ COMPROU': 8 }
const etapaPorFone = new Map()
for (const aba of ['TOUROS', 'FEMEAS', 'EMBRIÕES', 'OUTROS']) {
    for (const r of abas[aba]) {
        const k = foneKey(r['WhatsApp']); if (!k) continue
        const etapa = String(r['Etapa'] || '').trim().toUpperCase(); if (!etapa) continue
        const ja = etapaPorFone.get(k)
        if (!ja || (PESO[etapa] || 0) > (PESO[ja.etapa] || 0)) etapaPorFone.set(k, { etapa, quem: String(r['Atendido por'] || '').trim() })
    }
}
const info = r => etapaPorFone.get(foneKey(r['WhatsApp'])) || {}
const etapaDe = r => info(r).etapa || null
/** A planilha escreve o mesmo nome de quatro jeitos; sem canonizar, o ranking mente. */
const CANON = s => {
    const n = nomeNorm(s)
    if (!n) return '(sem responsável)'
    if (/pedro|preira/.test(n)) return 'Pedro Pereira'
    if (/luana/.test(n)) return 'Luana Cruz'
    if (/douglas/.test(n)) return 'Douglas Bispo'
    if (/marcelo/.test(n)) return 'Marcelo Carneiro'
    if (/jo[aã]o/.test(n)) return 'João Antônio'
    if (/f[aá]bio|fabio/.test(n)) return 'Fábio Omena'
    if (/leonardo|leozinho/.test(n)) return 'Leonardo Serafim'
    if (/frete/.test(n)) return '(anotação de frete)'
    return s
}
const PISO = { '1 a 50 cabeças': 1, '51 a 100 cabeças': 51, '101 a 300 cabeças': 101, '301 a 500 cabeças': 301, 'mais de 500 cabeças': 501, '1 a 99 cabeças': 1, '100 a 500 cabeças': 100, '501 a 1000 cabeças': 501, 'mais de 1000 cabeças': 1001, 'nenhuma': 0 }
const ehMql = r => (PISO[String(r['Cabeças'] || '').trim()] ?? null) >= 100 && /^sim$/i.test(String(r['Inscrição Estadual'] || '').trim())

/* ── submissões comprovadas nos grupos ────────────────────────────────────── */
const idx = indexaUniverso(leads.map(r => ({ nome: r['Nome'], fone: r['WhatsApp'], cpf: r['cpf'] || r['cpf_(brazil)'] || '', uf: r['UF'], origem: r['Origem'], data: r['Data'] })))
const comprovadas = []
for (const c of CADASTROS_AGOSTO) {
    // A origem do lead vem auditada da lib (anexo aberto, CPF/telefone/nome
    // conferidos). Aqui só se confirma que a campanha e uma das ativas e se
    // busca a data do lead na planilha, para medir o tempo lead -> ficha.
    if (!c.origemLead || !daOrigem.has(c.origemLead)) continue
    const a = casaNoUniverso(idx, c)
    const p = a ? provaDe(a) : null
    comprovadas.push({
        ...c, via: a?.via || 'declarado na apuracao', campanha: daOrigem.get(c.origemLead).curto, origem: c.origemLead,
        dataLead: p ? iso(p.data) : null,
        dias: p ? Math.round((new Date(c.data) - new Date(iso(p.data))) / 86400000) : null,
    })
}
comprovadas.sort((a, b) => a.data.localeCompare(b.data))
/** Fichas do mes por quem postou — a regra de marketing x assessor comercial. */
const porPostador = {}
for (const c of CADASTROS_AGOSTO) {
    const q = c.postadaPor || '(nao identificado)'
    porPostador[q] ??= { n: 0, aprovados: 0, doFunil: 0, marketing: EQUIPE_MARKETING.includes(q) }
    porPostador[q].n++
    if (c.status === 'aprovado') porPostador[q].aprovados++
    if (c.origemLead && daOrigem.has(c.origemLead)) porPostador[q].doFunil++
}
const totalFichas = CADASTROS_AGOSTO.length
const fichasMarketing = CADASTROS_AGOSTO.filter(c => EQUIPE_MARKETING.includes(c.postadaPor)).length
const fichasAssessor = CADASTROS_AGOSTO.filter(c => c.postadaPor && !EQUIPE_MARKETING.includes(c.postadaPor)).length
const chaveComprovada = new Set(comprovadas.map(c => nomeNorm(c.nome)))
const casaComprovada = nome => {
    const k = nomeNorm(nome)
    return comprovadas.find(c => { const g = nomeNorm(c.nome); return g === k || g.includes(k) || k.includes(g) })
}

/* ── declaradas na planilha ───────────────────────────────────────────────── */
const declaradas = leads.filter(r => etapaDe(r) === 'CADASTRO OK').map(r => {
    const g = casaComprovada(r['Nome'])
    return {
        nome: r['Nome'], uf: r['UF'], data: iso(r['Data']), quem: CANON(info(r).quem),
        campanha: daOrigem.get(String(r['Origem'])).curto, origem: r['Origem'],
        mql: ehMql(r), grupo: g ? g.status : null, dataGrupo: g ? g.data : null,
    }
}).sort((a, b) => a.data.localeCompare(b.data))

/* ── agregados ────────────────────────────────────────────────────────────── */
const emAgosto = r => iso(r['Data']).startsWith('2026-08')
const conta = rs => ({
    n: rs.length, agosto: rs.filter(emAgosto).length, mql: rs.filter(ehMql).length,
    tocados: rs.filter(r => etapaDe(r)).length,
    semEtapa: rs.filter(r => !etapaDe(r)).length,
    conexao: rs.filter(r => etapaDe(r) === 'CONEXÃO').length,
    naoRespondeu: rs.filter(r => etapaDe(r) === 'NÃO RESPONDEU').length,
    numeroErrado: rs.filter(r => etapaDe(r) === 'NUMERO ERRADO').length,
    declarados: rs.filter(r => etapaDe(r) === 'CADASTRO OK').length,
    reprovados: rs.filter(r => etapaDe(r) === 'CADASTRO REPROVADO').length,
})
const geral = conta(leads)

const porCampanha = CAMPANHAS.map(c => {
    const rs = leads.filter(r => daOrigem.get(String(r['Origem'])).id === c.id)
    const m = midiaDe(c.id)
    const comp = comprovadas.filter(x => daOrigem.get(String(x.origem))?.id === c.id)
    return { ...c, ...conta(rs), investidoVida: m.vida?.investido || 0, investidoAgosto: m.agosto?.investido || 0, comprovados: comp.length, aprovados: comp.filter(x => x.status === 'aprovado').length }
})

const equipe = {}
for (const r of leads) {
    const q = CANON(info(r).quem)
    equipe[q] ??= { n: 0, conexao: 0, naoRespondeu: 0, declarados: 0, comprovados: 0, mql: 0 }
    equipe[q].n++
    if (ehMql(r)) equipe[q].mql++
    const e = etapaDe(r)
    if (e === 'CONEXÃO') equipe[q].conexao++
    if (e === 'NÃO RESPONDEU') equipe[q].naoRespondeu++
    if (e === 'CADASTRO OK') { equipe[q].declarados++; if (casaComprovada(r['Nome'])) equipe[q].comprovados++ }
}
const ranking = Object.entries(equipe).filter(([q]) => q !== '(sem responsável)' && q !== '(anotação de frete)').sort((a, b) => b[1].n - a[1].n)
const semDono = equipe['(sem responsável)']?.n || 0

/* ── vendas ───────────────────────────────────────────────────────────────── */
const compras = JSON.parse(fs.readFileSync(path.join(F, 'hp-compras-2026.json'), 'utf8')).filter(c => String(c.lei_data || '').startsWith('2026-08'))
const porComprador = new Map()
for (const c of compras) {
    const k = nomeNorm(c.cli_nome)
    if (!porComprador.has(k)) porComprador.set(k, { nome: c.cli_nome, cpf: c.cli_cpfcnpj, fone: c.cli_celular || c.cli_fonecom1 || c.cli_foneres, uf: c.cli_uf, linhas: [] })
    porComprador.get(k).linhas.push(c)
}
const vendas = []
for (const p of porComprador.values()) {
    const a = casaNoUniverso(idx, p); if (!a) continue
    const pr = provaDe(a)
    vendas.push({
        nome: p.nome, via: a.via, campanha: daOrigem.get(String(pr.origem))?.curto || pr.origem, dataLead: iso(pr.data),
        leilao: p.linhas[0].lei_nome, dataLeilao: p.linhas[0].lei_data,
        lotes: p.linhas.length, animais: p.linhas.reduce((s, x) => s + (+x.lot_qtd || 0), 0),
        valor: p.linhas.reduce((s, x) => s + (+x.lot_total || 0), 0),
    })
}
vendas.sort((a, b) => b.valor - a.valor)
const vgv = vendas.reduce((s, v) => s + v.valor, 0)
const animais = vendas.reduce((s, v) => s + v.animais, 0)

/* fila parada: lead sem etapa nenhuma, do mais novo para o mais velho */
const semToque = leads.filter(r => !etapaDe(r)).sort((a, b) => iso(b['Data']).localeCompare(iso(a['Data'])))

/* ── PDF ──────────────────────────────────────────────────────────────────── */
const passo = (rotulo, valor, base, obs) => `<tr>
  <td class="et">${esc(rotulo)}</td>
  <td class="num q">${num(valor)}</td>
  <td class="num">${base ? pct(valor, base) : '—'}</td>
  <td style="width:34mm"><span class="bar" style="width:${(valor / geral.n * 34).toFixed(1)}mm"></span></td>
  <td class="micro">${obs}</td></tr>`

const corpo = `
<div class="cap">
  <div>
    <h1>Desempenho operacional das campanhas</h1>
    <div class="sub">Agosto/2026, até o dia 26. Universo fechado: as ${CAMPANHAS.length} campanhas que veicularam no mês e as landings delas —
    ${geral.n} pessoas. Campanha encerrada antes de agosto ficou de fora. Cada cadastro é contado onde há prova: declaração da equipe e ficha no grupo são colunas separadas.</div>
  </div>
  <div class="meta">
    <div class="tot">${geral.n}<small>leads no universo</small></div>
    <div style="margin-top:6px">${geral.agosto} chegaram em agosto<br>${geral.n - geral.agosto} vieram de julho<br>${HOJE}</div>
  </div>
</div>

<div class="cards">
  <div class="card"><div class="z">Leads tocados</div><div class="n">${pct(geral.tocados, geral.n)}<small>${geral.tocados} de ${geral.n} — ${geral.semEtapa} sem nenhuma anotação</small></div></div>
  <div class="card"><div class="z">Conexão (falou com a gente)</div><div class="n">${pct(geral.conexao, geral.n)}<small>${geral.conexao} leads</small></div></div>
  <div class="card"><div class="z">Cadastro declarado</div><div class="n">${geral.declarados}<small>${pct(geral.declarados, geral.n)} do universo</small></div></div>
  <div class="card"><div class="z">Ficha comprovada no grupo</div><div class="n">${comprovadas.length}<small>${comprovadas.filter(c => c.status === 'aprovado').length} aprovadas · ${pct(comprovadas.length, geral.declarados)} do declarado</small></div></div>
  <div class="card"><div class="z">Venda gerada</div><div class="n">${brl0(vgv)}<small>${vendas.length} compradores · ${animais} animais</small></div></div>
</div>

<div class="box alerta avoid">
  <h3>O que a operação fez com esses ${geral.n} leads</h3>
  <ul>
    <li><b>Atendimento cobre quase tudo: ${pct(geral.tocados, geral.n)} dos leads têm anotação.</b> Sobram ${geral.semEtapa} sem toque nenhum — ${semToque.filter(emAgosto).length} deles chegaram em agosto, e ${semToque.filter(r => iso(r['Data']) >= '2026-08-18').length} são dos dias 18 a 20, a última leva antes da mídia parar.</li>
    <li><b>Metade responde: ${geral.conexao} conexões (${pct(geral.conexao, geral.tocados)} de quem foi tocado)</b>; ${geral.naoRespondeu} não responderam e ${geral.numeroErrado} eram número errado.</li>
    <li><b>O funil trava entre a conversa e a ficha.</b> São ${geral.conexao} conexões e ${geral.mql} MQL, mas só <b>${comprovadas.length} viraram ficha no grupo</b> (${comprovadas.filter(c => c.status === 'aprovado').length} aprovadas, ${comprovadas.filter(c => c.status === 'recusado').length} reprovadas, ${comprovadas.filter(c => c.status === 'pendente').length} sem resposta). De cada ${Math.round(geral.conexao / comprovadas.length)} conversas, uma chega à leiloeira.</li>
    <li><b>Quando a ficha entra, ela anda rápido:</b> ${comprovadas.filter(c => c.dias !== null && c.dias <= 1).length} das ${comprovadas.filter(c => c.dias !== null).length} com data de lead conhecida foram postadas em até 1 dia. O gargalo não é a leiloeira — é chegar até a ficha.</li>
    <li><b>${fichasMarketing} das ${totalFichas} fichas do mês saíram da equipe de marketing</b> (Douglas ${porPostador['Douglas Bispo']?.n || 0}, Marcelo ${porPostador['Marcelo Carneiro']?.n || 0}, Luana ${porPostador['Luana Cruz']?.n || 0}, João Antônio ${porPostador['João Antônio']?.n || 0}); ${fichasAssessor} saíram dos assessores comerciais, que trabalham carteira própria e não entram neste funil.</li>
    <li><b>Retorno até aqui: ${brl0(vgv)} em ${animais} animais</b>, com ${brl0(totalVida)} investidos nessas campanhas (${brl0(totalAgosto)} em agosto).</li>
  </ul>
</div>

<h2>O funil das campanhas ativas, passo a passo</h2>
<table class="funil">
  <thead><tr><th>Passo</th><th class="r">Pessoas</th><th class="r">% do universo</th><th></th><th>O que isso quer dizer</th></tr></thead>
  <tbody>
    ${passo('Leads recebidos', geral.n, null, `${geral.agosto} entraram em agosto · ${geral.n - geral.agosto} de julho (Touro e São Geraldo começaram no fim do mês) · ${duplicadas} linhas repetidas descartadas`)}
    ${passo('Com anotação da equipe', geral.tocados, geral.n, 'alguém registrou etapa na planilha')}
    ${passo('Conexão', geral.conexao, geral.n, 'respondeu e conversou')}
    ${passo('Perfil qualificado (MQL)', geral.mql, geral.n, '100+ cabeças e com I.E. — atributo do lead, não etapa de atendimento')}
    ${passo('Cadastro declarado na planilha', geral.declarados, geral.n, 'a equipe marcou CADASTRO OK')}
    ${passo('Ficha comprovada no grupo', comprovadas.length, geral.n, 'existe ficha e resposta da leiloeira, casada com o lead')}
    ${passo('Aprovado pela leiloeira', comprovadas.filter(c => c.status === 'aprovado').length, geral.n, 'aprovação registrada no grupo')}
    ${passo('Comprou', vendas.length, geral.n, `${brl0(vgv)} · ${animais} animais`)}
  </tbody>
</table>
<p class="micro">"Declarado" e "comprovado" medem coisas diferentes de propósito. A planilha é a régua da equipe; o grupo é onde a leiloeira decide. Quando os dois divergem, o relatório mostra os dois números em vez de escolher um.</p>

<h2>Campanha a campanha</h2>
<table>
  <thead><tr><th>Campanha</th><th class="r">Investido<br>(agosto)</th><th class="r">Leads</th><th class="r">Tocados</th><th class="r">Conexão</th><th class="r">MQL</th><th class="r">Cadastro<br>declarado</th><th class="r">Ficha no<br>grupo</th><th class="r">Custo<br>por lead</th></tr></thead>
  <tbody>
  ${porCampanha.map(c => `<tr>
    <td class="nome">${esc(c.curto)}<br><span class="micro">no ar desde ${dataBr(c.desde)}${c.investidoVida > c.investidoAgosto ? ` · ${brl0(c.investidoVida)} na vida toda` : ''}</span></td>
    <td class="num">${brl(c.investidoAgosto)}</td>
    <td class="num">${c.n} <span class="micro">(${c.agosto} em ago)</span></td>
    <td class="num">${c.tocados} <span class="micro">${pct(c.tocados, c.n)}</span></td>
    <td class="num">${c.conexao} <span class="micro">${pct(c.conexao, c.n)}</span></td>
    <td class="num">${c.mql}</td>
    <td class="num">${c.declarados}</td>
    <td class="num q">${c.comprovados}</td>
    <td class="num">${c.n ? brl(c.investidoVida / c.n) : '—'}</td></tr>`).join('')}
  </tbody>
  <tfoot><tr><td>Total</td><td class="num">${brl(totalAgosto)}</td><td class="num">${geral.n}</td><td class="num">${geral.tocados}</td><td class="num">${geral.conexao}</td>
    <td class="num">${geral.mql}</td><td class="num">${geral.declarados}</td><td class="num">${comprovadas.length}</td><td class="num">${brl(totalVida / geral.n)}</td></tr></tfoot>
</table>
<p class="micro"><b>Fêmeas e Expogenética não produziram um cadastro sequer</b> — juntas são ${porCampanha.filter(c => !c.declarados).reduce((s, c) => s + c.n, 0)} leads e ${brl0(porCampanha.filter(c => !c.declarados).reduce((s, c) => s + c.investidoAgosto, 0))} de agosto.
Expogenética entrou em 17/08 e parou junto com a conta em 20/08: teve 4 dias de vida. Fêmeas rodou de 11 a 20/08 com ${porCampanha.find(c => c.curto === 'Perpétuo Fêmeas').conexao} conexões e nenhuma ficha.</p>

<h2>Quem atendeu</h2>
<table>
  <thead><tr><th>Pessoa</th><th class="r">Leads</th><th class="r">MQL na mão</th><th class="r">Conexão</th><th class="r">Não respondeu</th><th class="r">Cadastro declarado</th><th class="r">Ficha no grupo</th></tr></thead>
  <tbody>
  ${ranking.map(([q, v]) => `<tr><td class="nome">${esc(q)}</td><td class="num">${v.n}</td><td class="num">${v.mql}</td>
    <td class="num">${v.conexao} <span class="micro">${pct(v.conexao, v.n)}</span></td><td class="num">${v.naoRespondeu}</td>
    <td class="num">${v.declarados}</td><td class="num q">${v.comprovados}</td></tr>`).join('')}
  <tr><td class="off">(sem responsável anotado)</td><td class="num">${semDono}</td><td class="num off">—</td><td class="num off">—</td><td class="num off">—</td><td class="num off">—</td><td class="num off">—</td></tr>
  </tbody>
</table>
<p class="micro">Nome canonizado: a planilha traz "Pedro Pereira", "Pedro pereira", "pedro pereira" e "Pedro preira" como pessoas diferentes. Luana entrou em 14/08 — os ${equipe['Luana Cruz']?.n || 0} leads dela são de 12 dias de casa, e ${equipe['Luana Cruz']?.comprovados || 0} das ${comprovadas.length} fichas comprovadas do mês são dela.</p>

<h2>Quem levou ficha ao grupo em agosto</h2>
<table>
  <thead><tr><th>Quem postou</th><th>Papel</th><th class="r">Fichas no mês</th><th class="r">Aprovadas</th><th class="r">De lead de campanha ativa</th></tr></thead>
  <tbody>
  ${Object.entries(porPostador).sort((a, b) => b[1].n - a[1].n).map(([q, v]) => `<tr>
    <td class="nome">${esc(q)}</td>
    <td class="micro">${v.marketing ? 'Marketing' : q === '(nao identificado)' ? '<span class="off">ficha sem remetente registrado</span>' : 'Assessor comercial'}</td>
    <td class="num">${v.n}</td><td class="num">${v.aprovados}</td><td class="num q">${v.doFunil || '<span class="off">—</span>'}</td></tr>`).join('')}
  </tbody>
  <tfoot><tr><td colspan="2">Total de fichas nos dois grupos</td><td class="num">${totalFichas}</td>
    <td class="num">${CADASTROS_AGOSTO.filter(c => c.status === 'aprovado').length}</td><td class="num">${comprovadas.length}</td></tr></tfoot>
</table>
<p class="micro">O mês inteiro dos dois grupos tem ${totalFichas} submissões — este relatório mede as ${comprovadas.length} que vieram das campanhas ativas.
As outras são carteira dos assessores, lead de campanha já encerrada (EAO) ou ficha sem nome no texto e sem anexo capturado.</p>

<div class="pg"></div>
<h2>Os ${geral.declarados} cadastros declarados — e o que o grupo confirma</h2>
<table>
  <thead><tr><th>Lead em</th><th>Cliente</th><th>UF</th><th>Campanha</th><th>Quem marcou</th><th>Perfil</th><th>No grupo da leiloeira</th></tr></thead>
  <tbody>
  ${declaradas.map(d => `<tr>
    <td class="num">${dataBr(d.data)}</td>
    <td class="nome">${esc(d.nome)}</td>
    <td>${esc(d.uf || '—')}</td>
    <td class="micro">${esc(d.campanha)}<br><span class="off">${esc(d.origem)}</span></td>
    <td class="micro">${esc(d.quem)}</td>
    <td class="micro">${d.mql ? 'MQL' : '—'}</td>
    <td class="${d.grupo ? 'nome' : 'micro'}">${d.grupo
        ? `${d.grupo === 'aprovado' ? '<b>Aprovado</b>' : d.grupo === 'recusado' ? 'Reprovado' : 'Ficha postada, sem resposta'} em ${dataBr(d.dataGrupo)}`
        : '<span class="off">sem ficha nos grupos</span>'}</td></tr>`).join('')}
  </tbody>
</table>
<div class="box grey avoid">
  <p><b>${declaradas.filter(d => !d.grupo).length} dos ${geral.declarados} declarados não têm ficha rastreável nos grupos</b>, todos de julho (${[...new Set(declaradas.filter(d => !d.grupo).map(d => d.quem))].join(', ')}).
  Isso não quer dizer que o cadastro não exista — pode ter ido direto para a leiloeira por e-mail, pelo portal dela ou pelo contato do assessor. Quer dizer que <b>a Bula não consegue provar nem acompanhar</b>: sem data de envio e sem resposta registrada, se a leiloeira não responder ninguém fica sabendo.</p>
  <p>Um caso continua em aberto: <b>Mauro</b> (GO, lead de 19/08, marcado CADASTRO OK por Pedro Pereira). Naquele mesmo dia o grupo aprovou uma consulta sem nome — "Score razoável (692), possui IE, aprovado" — que chegou encaminhada de outra conversa, sem anexo para abrir.
  Se for ele, o funil tem ${comprovadas.length + 1} fichas em vez de ${comprovadas.length}. Só quem atendeu resolve.</p>
  <p><b>E o contrário também acontece:</b> <b>Marcionei</b> está marcado CADASTRO OK na planilha desde 19/08, mas a resposta do grupo em 22/08 foi "não tem cadastro" e depois "precisa do documento pessoal e contato" — segue em aberto.
  Já <b>Hélio Mascarenhas</b>, <b>Handerson</b> e <b>Bruna Alaise</b> passaram pelos grupos sem estar marcados como cadastro na planilha: a ficha existe, o registro do trabalho não.</p>
</div>

<h2>As ${comprovadas.length} fichas comprovadas</h2>
<table>
  <thead><tr><th>Cliente</th><th>Campanha</th><th class="r">Lead</th><th class="r">Ficha</th><th class="r">Dias</th><th>Decisão</th><th>Evidência</th></tr></thead>
  <tbody>
  ${comprovadas.map(c => `<tr>
    <td class="nome">${esc(c.nome)}${c.cpf ? `<br><span class="micro">${esc(c.cpf)}</span>` : ''}</td>
    <td class="micro">${esc(c.campanha)}<br><span class="off">casado por ${esc(c.via)}</span></td>
    <td class="num">${dataBr(c.dataLead)}</td><td class="num">${dataBr(c.data)}</td>
    <td class="num q">${c.dias}</td>
    <td class="nome">${c.status === 'aprovado' ? 'Aprovado' : c.status === 'recusado' ? 'Reprovado' : 'Sem resposta'}</td>
    <td class="micro">${esc(c.evidencia)}</td></tr>`).join('')}
  </tbody>
</table>

<h2>A venda que veio dessas campanhas</h2>
<table>
  <thead><tr><th>Cliente</th><th>Campanha</th><th class="r">Lead em</th><th>Leilão</th><th class="r">Data</th><th class="r">Lotes</th><th class="r">Animais</th><th class="r">Valor</th></tr></thead>
  <tbody>${vendas.map(v => `<tr><td class="nome">${esc(v.nome)}</td><td class="micro">${esc(v.campanha)}<br><span class="off">casado por ${esc(v.via)}</span></td>
    <td class="num">${dataBr(v.dataLead)}</td><td>${esc(v.leilao)}</td><td class="num">${dataBr(v.dataLeilao)}</td>
    <td class="num">${v.lotes}</td><td class="num">${v.animais}</td><td class="num">${brl0(v.valor)}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="7">Total</td><td class="num">${brl0(vgv)}</td></tr></tfoot>
</table>
<p class="micro">Cruzamento dos ${porComprador.size} compradores de agosto no ERP contra o universo, por CPF, telefone ou nome completo.
Os dois entraram como lead no fim de julho e compraram semanas depois — nenhum deles aparece nas fichas dos grupos, ou seja, <b>comprou sem passar pelo cadastro que a gente controla</b>.
Custo de mídia por comprador: ${brl0(totalVida / vendas.length)}.</p>

<h2>A fila parada</h2>
<p>${semToque.length} leads do universo estão sem anotação nenhuma na planilha${semToque.filter(emAgosto).length ? `, ${semToque.filter(emAgosto).length} deles de agosto` : ''}:</p>
<table>
  <thead><tr><th class="r">Entrou em</th><th>Nome</th><th>UF</th><th>Campanha</th><th>Cabeças</th><th>I.E.</th></tr></thead>
  <tbody>${semToque.slice(0, 16).map(r => `<tr><td class="num">${esc(String(r['Data']).split(',')[0])}</td><td class="nome">${esc(r['Nome'])}</td>
    <td>${esc(r['UF'] || '—')}</td><td class="micro">${esc(daOrigem.get(String(r['Origem'])).curto)}</td>
    <td class="micro">${esc(r['Cabeças'] || '—')}</td><td class="micro">${esc(r['Inscrição Estadual'] || '—')}</td></tr>`).join('')}</tbody>
</table>
${semToque.length > 16 ? `<p class="micro">Mais ${semToque.length - 16} na planilha do XLSX, aba "Fila parada".</p>` : ''}

<h2>Onde a operação ganha e onde perde</h2>
<div class="box avoid">
  <ul>
    <li><b>Ganha no atendimento.</b> ${pct(geral.tocados, geral.n)} de cobertura e ${pct(geral.conexao, geral.tocados)} de conexão entre os tocados. Não é aqui que a meta se perde.</li>
    <li><b>Perde entre a conversa e a ficha.</b> ${geral.conexao} conexões e ${geral.mql} MQL viraram ${comprovadas.length} fichas comprovadas. Todo o resto do funil depende desse passo, e ele não tem dono nem prazo hoje.</li>
    <li><b>Perde no registro, nos dois sentidos.</b> ${declaradas.filter(d => !d.grupo).length} cadastros declarados sem ficha rastreável, e ${comprovadas.filter(c => !declaradas.some(d => nomeNorm(d.nome) && (nomeNorm(c.nome).includes(nomeNorm(d.nome)) || nomeNorm(d.nome).includes(nomeNorm(c.nome))))).length} fichas que foram ao grupo sem virar etapa na planilha. A planilha e o grupo contam histórias diferentes do mesmo mês.</li>
    <li><b>A ficha vai como anexo e ninguém escreve o nome.</b> Foi preciso abrir 68 documentos para saber quem eram os clientes de agosto. Uma linha de texto com nome e CPF junto do anexo resolveria — e é o que separa uma apuração de meia hora de uma de meio dia.</li>
    <li><b>Duas campanhas não entregaram nada.</b> Fêmeas e Expogenética somam ${porCampanha.filter(c => !c.declarados).reduce((s, c) => s + c.n, 0)} leads sem um cadastro. Antes de repor verba nelas, vale entender se é oferta, criativo ou atendimento.</li>
    <li><b>E a torneira está fechada.</b> A conta não veicula desde 20/08 — a fila de ${semToque.length} leads sem toque é a última que existe até religarem.</li>
  </ul>
</div>

<footer><span>Bula Assessoria — desempenho operacional das campanhas ativas, agosto/2026</span><span>Apurado em ${HOJE} · planilha de leads + grupos de cadastro + Meta Ads + ERP</span></footer>
`

const html = pagina('Desempenho operacional das campanhas — agosto/2026', corpo)
const pdf = path.join(saida, 'operacional-campanhas-agosto-2026.pdf')
fs.writeFileSync(path.join(saida, 'operacional-campanhas-agosto-2026.html'), html)
await paraPdf(html, pdf)

/* ── XLSX ─────────────────────────────────────────────────────────────────── */
const wb = new ExcelJS.Workbook()
const cabec = (ws, cols) => {
    ws.columns = cols
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } }
}
const wsF = wb.addWorksheet('Funil')
cabec(wsF, [{ header: 'Passo', key: 'p', width: 34 }, { header: 'Pessoas', key: 'n', width: 12 }, { header: '% do universo', key: 'x', width: 14 }])
for (const [p, n] of [['Leads recebidos', geral.n], ['Com anotação da equipe', geral.tocados], ['Conexão', geral.conexao],
    ['Perfil qualificado (MQL)', geral.mql], ['Cadastro declarado', geral.declarados], ['Ficha comprovada no grupo', comprovadas.length],
    ['Aprovado pela leiloeira', comprovadas.filter(c => c.status === 'aprovado').length], ['Comprou', vendas.length]])
    wsF.addRow({ p, n, x: pct(n, geral.n) })

const wsC = wb.addWorksheet('Campanhas')
cabec(wsC, [{ header: 'Campanha', key: 'c', width: 26 }, { header: 'No ar desde', key: 'd', width: 13 },
    { header: 'Investido agosto', key: 'ia', width: 16 }, { header: 'Investido total', key: 'iv', width: 16 },
    { header: 'Leads', key: 'n', width: 9 }, { header: 'Leads de agosto', key: 'a', width: 15 },
    { header: 'Tocados', key: 't', width: 10 }, { header: 'Conexão', key: 'x', width: 10 },
    { header: 'MQL', key: 'm', width: 8 }, { header: 'Declarados', key: 'dc', width: 12 },
    { header: 'Ficha no grupo', key: 'g', width: 14 }, { header: 'Custo por lead', key: 'cl', width: 14 }])
for (const c of porCampanha) wsC.addRow({ c: c.curto, d: dataBr(c.desde), ia: c.investidoAgosto, iv: c.investidoVida, n: c.n, a: c.agosto, t: c.tocados, x: c.conexao, m: c.mql, dc: c.declarados, g: c.comprovados, cl: c.n ? +(c.investidoVida / c.n).toFixed(2) : '' })

const wsD = wb.addWorksheet('Cadastros declarados')
cabec(wsD, [{ header: 'Lead em', key: 'd', width: 12 }, { header: 'Cliente', key: 'n', width: 36 }, { header: 'UF', key: 'u', width: 6 },
    { header: 'Campanha', key: 'c', width: 20 }, { header: 'Origem', key: 'o', width: 32 }, { header: 'Quem marcou', key: 'q', width: 20 },
    { header: 'MQL', key: 'm', width: 7 }, { header: 'Status no grupo', key: 'g', width: 22 }, { header: 'Data no grupo', key: 'dg', width: 14 }])
for (const d of declaradas) wsD.addRow({ d: dataBr(d.data), n: d.nome, u: d.uf, c: d.campanha, o: d.origem, q: d.quem, m: d.mql ? 'sim' : '', g: d.grupo || 'sem ficha nos grupos', dg: d.dataGrupo ? dataBr(d.dataGrupo) : '' })

const wsG = wb.addWorksheet('Fichas comprovadas')
cabec(wsG, [{ header: 'Cliente', key: 'n', width: 36 }, { header: 'CPF', key: 'c', width: 18 }, { header: 'Campanha', key: 'k', width: 20 },
    { header: 'Lead em', key: 'l', width: 12 }, { header: 'Ficha em', key: 'f', width: 12 }, { header: 'Dias', key: 'd', width: 7 },
    { header: 'Decisão', key: 's', width: 12 }, { header: 'Casado por', key: 'v', width: 14 }, { header: 'Evidência', key: 'e', width: 100 }])
for (const c of comprovadas) wsG.addRow({ n: c.nome, c: c.cpf || '', k: c.campanha, l: dataBr(c.dataLead), f: dataBr(c.data), d: c.dias, s: c.status, v: c.via, e: c.evidencia })

const wsE = wb.addWorksheet('Equipe')
cabec(wsE, [{ header: 'Pessoa', key: 'p', width: 24 }, { header: 'Leads', key: 'n', width: 9 }, { header: 'MQL', key: 'm', width: 8 },
    { header: 'Conexão', key: 'c', width: 10 }, { header: 'Não respondeu', key: 'r', width: 15 },
    { header: 'Declarados', key: 'd', width: 12 }, { header: 'Ficha no grupo', key: 'g', width: 14 }])
for (const [q, v] of ranking) wsE.addRow({ p: q, n: v.n, m: v.mql, c: v.conexao, r: v.naoRespondeu, d: v.declarados, g: v.comprovados })
wsE.addRow({ p: '(sem responsável anotado)', n: semDono })

const wsL = wb.addWorksheet('Universo de leads')
cabec(wsL, [{ header: 'Data', key: 'd', width: 18 }, { header: 'Nome', key: 'n', width: 34 }, { header: 'WhatsApp', key: 'w', width: 18 },
    { header: 'UF', key: 'u', width: 6 }, { header: 'Cabeças', key: 'c', width: 18 }, { header: 'I.E.', key: 'i', width: 7 },
    { header: 'MQL', key: 'q', width: 7 }, { header: 'Campanha', key: 'k', width: 20 }, { header: 'Origem', key: 'o', width: 32 },
    { header: 'Etapa', key: 'e', width: 26 }, { header: 'Atendido por', key: 'a', width: 20 }])
for (const r of leads.sort((a, b) => iso(b['Data']).localeCompare(iso(a['Data'])))) {
    wsL.addRow({ d: r['Data'], n: r['Nome'], w: r['WhatsApp'], u: r['UF'], c: r['Cabeças'], i: r['Inscrição Estadual'],
        q: ehMql(r) ? 'sim' : '', k: daOrigem.get(String(r['Origem'])).curto, o: r['Origem'], e: etapaDe(r) || '(sem etapa)', a: CANON(info(r).quem) })
}

const wsS = wb.addWorksheet('Fila parada')
cabec(wsS, [{ header: 'Data', key: 'd', width: 18 }, { header: 'Nome', key: 'n', width: 34 }, { header: 'WhatsApp', key: 'w', width: 18 },
    { header: 'UF', key: 'u', width: 6 }, { header: 'Campanha', key: 'k', width: 20 }, { header: 'Cabeças', key: 'c', width: 18 }, { header: 'I.E.', key: 'i', width: 7 }])
for (const r of semToque) wsS.addRow({ d: r['Data'], n: r['Nome'], w: r['WhatsApp'], u: r['UF'], k: daOrigem.get(String(r['Origem'])).curto, c: r['Cabeças'], i: r['Inscrição Estadual'] })

const xlsx = path.join(saida, 'operacional-campanhas-agosto-2026.xlsx')
await wb.xlsx.writeFile(xlsx)

console.log(`PDF   ${pdf}`)
console.log(`XLSX  ${xlsx}`)
console.log(`universo ${geral.n} (ago ${geral.agosto}) · tocados ${geral.tocados} · conexão ${geral.conexao} · MQL ${geral.mql}`)
console.log(`declarados ${geral.declarados} · comprovados ${comprovadas.length} (aprov ${comprovadas.filter(c => c.status === 'aprovado').length}) · vendas ${vendas.length} = ${brl0(vgv)}`)
