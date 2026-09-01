/**
 * POR QUE A PLANILHA DIZ 14 E O QUADRO DIZ 11 — conferência nome a nome dos
 * cadastros de agosto/2026.
 *
 *   node scripts/gera-conferencia-cadastros-agosto-2026.mjs [pasta-de-saida]
 *
 * Pedido do João em 01/09, depois que o Marcelo mandou no grupo o print da
 * planilha filtrada por "CADASTRO OK" e disse "agosto foram 14 cadastros
 * aprovados", contra os 11 do quadro FUNIL DE VENDAS — AGOSTO FECHADO.
 *
 * SÃO DUAS RÉGUAS DIFERENTES, e nenhuma das duas está errada:
 *
 *   • A DELE — linha da planilha (abas TOUROS/FÊMEAS/OUTROS) com a coluna
 *     Etapa = "CADASTRO OK", filtrada pela coluna Data, que é a data em que o
 *     LEAD entrou. Quem marca é quem atendeu. São 14.
 *   • A DO QUADRO — ficha que efetivamente foi ao grupo da leiloeira dentro de
 *     agosto, casada com o lead por CPF, e cujo veredito transcrito da
 *     leiloeira foi aprovação. São 11 de 17 fichas.
 *
 * As duas listas saem das MESMAS fontes já auditadas:
 *   outputs/base-clientes-2026/fontes/planilha-leads.json  (snapshot 31/08)
 *   scripts/lib/cadastros-agosto-2026.mjs          (01→26/08, 44 fichas)
 *   scripts/lib/cadastros-melhoradores-2026-08.mjs (27→31/08, 12 fichas)
 *
 * O casamento entre a linha da planilha e a ficha do grupo está declarado em
 * PONTE (o lead preenche o formulário com um nome, a ficha chega com outro:
 * "Rui Escobar" é o Evaldo Luiz Nunes Escobar, "Cláudio / Kaline" é o Claudio
 * Eduardo Pupim). Onde não há ficha, PONTE diz por quê.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CADASTROS_AGOSTO } from './lib/cadastros-agosto-2026.mjs'
import { CADASTROS_JANELA } from './lib/cadastros-melhoradores-2026-08.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const saida = process.argv[2] || path.join(ROOT, 'outputs', 'conferencia-cadastros-agosto-2026')
fs.mkdirSync(saida, { recursive: true })

/* ── 1. a lista do Marcelo, reconstruída da planilha ──────────────────────── */
const planilha = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', 'base-clientes-2026', 'fontes', 'planilha-leads.json'), 'utf8'))
const ABAS = ['TOUROS', 'FEMEAS', 'EMBRIÕES', 'OUTROS']
const mesDe = d => { const m = String(d).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}` : '' }
const dia = d => { const m = String(d).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[1]}/${m[2]}` : '—' }
const ordem = d => { const m = String(d).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}${m[2]}${m[1]}` : '' }

const linhasOk = []
for (const aba of ABAS) {
    const { head, rows } = planilha[aba]
    for (const r of rows) {
        const o = Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))
        if (String(o['Etapa'] || '').trim().toUpperCase() !== 'CADASTRO OK') continue
        if (mesDe(o['Data']) !== '2026-08') continue
        linhasOk.push({ aba, data: o['Data'], nome: String(o['Nome']).trim(), atendido: String(o['Atendido por'] || '').trim(), uf: o['UF'], origem: String(o['Origem']) })
    }
}
linhasOk.sort((a, b) => ordem(a.data).localeCompare(ordem(b.data)))

/* ── 2. as fichas dos grupos, as duas janelas emendadas ───────────────────── */
const fichas = [
    ...CADASTROS_AGOSTO.map(c => ({ nome: c.nome, cpf: c.cpf || '', em: c.data, status: c.status })),
    ...CADASTROS_JANELA.map(c => ({ nome: c.nome, cpf: c.cpf || '', em: String(c.submetidaEm).slice(0, 10), status: c.status })),
]
const acha = nome => fichas.find(f => f.nome.toLowerCase() === nome.toLowerCase())

/**
 * A ponte entre a linha da planilha e a ficha do grupo. `ficha: null` = não
 * existe ficha, e `nota` explica o que existe no lugar.
 */
const PONTE = {
    'Fabio Rafael': { ficha: 'Fabio Rafael da Cunha Silva' },
    'Tarcisio Tomé de Souza': {
        ficha: null, veredito: 'provável',
        nota: 'Nenhuma ficha no nome dele. No mesmo 01/08, 10h depois do lead, o grupo consultou ADONÍCIO TOMÉ DE SOUZA (CPF 663.892.678-00) → "liberado, sem pendências ou restrições". Mesmo sobrenome, mesmo dia — provável, mas o formulário do São Geraldo não pede CPF, e sem CPF não há prova.',
    },
    'Ruy de freitas': { ficha: 'Ruy de Freitas Lima' },
    'Marcionei Luiz Dos Santos': { ficha: 'Marcionei Luiz dos Santos' },
    'mendesf711': {
        ficha: null, veredito: 'sem ficha',
        nota: 'Nenhuma consulta nos dois grupos com esse nome, CPF (034.485.819-76), telefone ou e-mail, em nenhum dia de agosto. E o formulário dele diz "sem inscrição estadual".',
    },
    'Mauro': {
        ficha: null, veredito: 'provável',
        nota: 'Em 19/08 11:47 o grupo aprovou uma consulta anônima — "Score razoável (692), possui IE, aprovado ✅" — encaminhada pelo Pedro Pereira sem anexo e sem nome no texto. É quase certo que seja ele (o Pedro atendeu o lead e marcou OK), mas não há nome nem CPF para provar.',
    },
    'Epitacio Garcia Neto Neto': { ficha: 'Epitacio Garcia Neto' },
    'Wandeilson Dias Sabino': { ficha: 'Wandeilson Dias Sabino' },
    'Agropecuária Pernambuco': { ficha: 'Agropecuária Pernambuco Ltda (Agropecuária GP)' },
    'Thyago Tabulero': {
        ficha: null, veredito: 'sem ficha',
        nota: 'Nenhuma mensagem dos dois grupos cita o nome, o CPF (008.870.602-85), o telefone ou o e-mail dele — nem em agosto, nem depois.',
    },
    'Cláudio / Kaline': { ficha: 'Claudio Eduardo Pupim' },
    'jesse martins mendes': { ficha: 'Jessé Martins Mendes' },
    'Ejamal Muhd Shihadeh Khalil': { ficha: 'Ejamal Muhd Shihadeh Khalil' },
    'Rui Escobar': { ficha: 'Evaldo Luiz Nunes Escobar' },
}

const CAMPANHA = {
    'Meta — LEADS - SAO GERALDO': 'São Geraldo', 'Landing São Geraldo': 'São Geraldo',
    'Landing Touros': 'Perpétuo Touro', 'Meta — LEAD - PERPETUO TOURO': 'Perpétuo Touro',
    'Meta — LEADS - Expogenética': 'Expogenética', 'Meta — LEADS - JACAMIN': 'Jacamin',
    'Meta — LEADS - Leilão Melhorado 30 ANOS': 'Melhoradores',
    'Landing Fêmeas — Funil Perpétuo': 'Perpétuo Fêmeas',
}

const conferidas = linhasOk.map(l => {
    const p = PONTE[l.nome]
    if (!p) throw new Error(`sem ponte declarada para "${l.nome}" — a planilha mudou, revisar`)
    const f = p.ficha ? acha(p.ficha) : null
    if (p.ficha && !f) throw new Error(`ficha "${p.ficha}" não existe mais nas libs`)
    return {
        ...l, campanha: CAMPANHA[l.origem] || l.origem, fichaNome: p.ficha, ficha: f,
        veredito: f ? f.status : p.veredito, nota: p.nota || '', em: f ? f.em : '',
    }
})

/* ── 3. os aprovados do quadro que NÃO estão na lista dele ────────────────── */
const nomesFicha = new Set(conferidas.filter(c => c.fichaNome).map(c => c.fichaNome))
const APROVADOS_QUADRO = [
    'Davison Avelino Gomes Pinto', 'Fabio Rafael da Cunha Silva', 'Ruy de Freitas Lima',
    'Bruna Alaise Silva Oliveira Arruda', 'Epitacio Garcia Neto', 'Wandeilson Dias Sabino',
    'Agropecuária Pernambuco Ltda (Agropecuária GP)', 'Jessé Martins Mendes', 'Claudio Eduardo Pupim',
    'Reginaldo Leandro da Silva', 'Evaldo Luiz Nunes Escobar',
]
const POR_QUE_FORA = {
    'Davison Avelino Gomes Pinto': { lead: '31/07', campanha: 'São Geraldo', motivo: 'A planilha marca CADASTRO OK, mas o lead entrou em 31/07 — cai fora de um filtro por data de agosto. A ficha foi ao grupo em 01/08 14:45: "DAVISON AVELINO GOMES PINTO | cadastro bom".' },
    'Bruna Alaise Silva Oliveira Arruda': { lead: '—', campanha: 'Perpétuo Fêmeas', motivo: 'Nunca foi lead: é a esposa do Handerson (lead das Fêmeas, reprovado em 12/08). A ficha dela foi junto e foi a aprovada — não existe linha na planilha para marcar.' },
    'Reginaldo Leandro da Silva': { lead: '28/08', campanha: 'Perpétuo Touro', motivo: 'Lead do Perpétuo Touro de 28/08 (na planilha o nome está invertido: "Leandro Silva Reginaldo"). A CNH dele foi ao grupo em 29/08 09:36 e voltou aprovada — mas a planilha marca NÃO RESPONDEU.' },
}
const extras = APROVADOS_QUADRO.filter(n => !nomesFicha.has(n)).map(n => ({ nome: n, ficha: acha(n), ...POR_QUE_FORA[n] }))

/* ── 4. o placar ──────────────────────────────────────────────────────────── */
const batem = conferidas.filter(c => c.veredito === 'aprovado')
const pendentes = conferidas.filter(c => c.veredito === 'pendente')
const semFicha = conferidas.filter(c => c.veredito === 'sem ficha')
const provaveis = conferidas.filter(c => c.veredito === 'provável')

/* ── 5. quadro ────────────────────────────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const dataUri = (p, mime) => `data:${mime};base64,${fs.readFileSync(path.join(ROOT, 'public', p)).toString('base64')}`
const FUNDO = dataUri('bula/assets/img/agenda-hero-nelore.png', 'image/png')
const LOGO = dataUri('logo-bula-assessoria-white.png', 'image/png')

const PIN = {
    aprovado: ['bom', 'APROVADO'], pendente: ['esperando', 'SEM VEREDITO'], recusado: ['ruim', 'RECUSADO'],
    'sem ficha': ['ruim', 'SEM FICHA'], 'provável': ['esperando', 'PROVÁVEL'],
}

const CSS = `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0d0b09; font-family: 'Segoe UI', Arial, sans-serif; color: #ece7df; }
  .quadro { width: 1000px; margin: 0 auto; background: #0d0b09; padding-bottom: 26px; }
  .capa { position: relative; height: 170px; overflow: hidden; }
  .capa img.foto { width: 100%; height: 100%; object-fit: cover; object-position: 50% 46%; filter: saturate(.72) contrast(1.04); }
  .capa::after { content: ''; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(13,11,9,.42) 0%, rgba(13,11,9,.58) 45%, rgba(13,11,9,.97) 100%); }
  .capa .marca { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 2; }
  .capa .marca img { width: 170px; }
  h1 { font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase; text-align: center; letter-spacing: .035em;
       margin: 0; padding: 2px 30px 0; font-size: 31px; font-weight: 700; color: #fff; line-height: 1.1; }
  h1 span { color: #c9a84c; }
  .sub { text-align: center; font-size: 12.5px; color: #9d958a; padding: 9px 44px 14px; line-height: 1.6; }
  .sub b { color: #cfc7ba; font-weight: 600; }
  .corpo { padding: 0 30px; }
  .destaque { display: flex; gap: 9px; margin: 2px 0 6px; }
  .destaque div { flex: 1; border: 1px solid #3a3226; padding: 9px 11px 10px; background: #131009; }
  .destaque .z { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #8b8275; }
  .destaque .n { font-family: 'Oswald', Arial, sans-serif; font-size: 25px; line-height: 1.15; margin-top: 3px; color: #c9a84c; }
  .destaque .p { font-size: 10px; color: #8b8275; margin-top: 3px; line-height: 1.4; }
  h2 { font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase; font-size: 12px; letter-spacing: .1em;
       color: #c9a84c; margin: 20px 0 0; padding-bottom: 6px; border-bottom: 1px solid #2c2519; }
  h2 small { color: #857d70; letter-spacing: .04em; text-transform: none; font-size: 11px; font-family: 'Segoe UI', Arial, sans-serif; }
  table { width: 100%; border-collapse: collapse; }
  thead th { color: #857d70; font-family: 'Oswald', Arial, sans-serif; font-weight: 500; text-transform: uppercase;
             letter-spacing: .07em; font-size: 9.5px; padding: 8px 8px 6px; text-align: left; border-bottom: 1px solid #2c2519; }
  td { padding: 7px 8px; border-bottom: 1px solid #201b15; font-size: 12.5px; color: #d9d2c7; vertical-align: top; }
  td.i { width: 22px; font-family: 'Oswald', Arial, sans-serif; color: #6b6357; }
  td.nome { font-weight: 600; color: #f2ede5; font-size: 13px; }
  td.nome i { display: block; font-weight: 400; font-style: normal; color: #8b8275; font-size: 10.5px; margin-top: 2px; }
  td.dim { color: #8b8275; font-size: 11.5px; white-space: nowrap; }
  td.st { white-space: nowrap; font-family: 'Oswald', Arial, sans-serif; font-size: 11px; letter-spacing: .06em; }
  td.st.bom { color: #62c07f; } td.st.ruim { color: #e2695f; } td.st.esperando { color: #e2a05f; }
  td.nota { color: #9d958a; font-size: 10.5px; line-height: 1.5; padding-top: 0; }
  .rodape { margin-top: 20px; border-top: 1px solid #2c2519; padding-top: 12px; font-size: 11.5px; color: #8b8275; line-height: 1.65; }
  .rodape b { color: #cfc7ba; }
  .rodape .conta { color: #c9a84c; font-family: 'Oswald', Arial, sans-serif; letter-spacing: .04em; font-size: 12.5px; margin-bottom: 6px; }
  .assinatura { color: #5f584d; font-size: 10px; margin-top: 9px; }`

const linhaConferida = (c, i) => {
    const [cls, rot] = PIN[c.veredito] || ['', String(c.veredito).toUpperCase()]
    const apelido = c.fichaNome && c.fichaNome.toLowerCase() !== c.nome.toLowerCase()
        ? `<i>ficha no grupo: ${esc(c.fichaNome)}</i>` : ''
    return `<tr>
    <td class="i">${i + 1}</td>
    <td class="nome">${esc(c.nome)}${apelido}</td>
    <td class="dim">${dia(c.data)}</td>
    <td class="dim">${esc(c.campanha)}</td>
    <td class="dim">${esc(c.atendido)}</td>
    <td class="dim">${c.em ? c.em.slice(8, 10) + '/' + c.em.slice(5, 7) : '—'}</td>
    <td class="st ${cls}">${rot}</td>
  </tr>${c.nota ? `<tr><td></td><td class="nota" colspan="6">${esc(c.nota)}</td></tr>` : ''}`
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body><div class="quadro">
  <div class="capa"><img class="foto" src="${FUNDO}"><div class="marca"><img src="${LOGO}"></div></div>
  <h1>CADASTROS DE AGOSTO — <span>14 OU 11?</span></h1>
  <div class="sub">
    A planilha, filtrada por <b>CADASTRO OK</b> e pela data do lead, dá <b>14</b>. O quadro do funil conta a ficha que
    foi ao grupo da leiloeira e voltou aprovada dentro de agosto, e dá <b>11 de 17</b>.<br>
    São duas réguas diferentes — <b>${batem.length} nomes estão nas duas</b>. Abaixo, os ${conferidas.length} da planilha um a um, e os ${extras.length} que só o quadro enxerga.
  </div>
  <div class="corpo">
    <div class="destaque">
      <div><div class="z">Planilha · Cadastro OK</div><div class="n">${conferidas.length}</div><div class="p">leads de agosto marcados por quem atendeu</div></div>
      <div><div class="z">Quadro · aprovados</div><div class="n">${APROVADOS_QUADRO.length}</div><div class="p">de 17 fichas levadas ao grupo em agosto</div></div>
      <div><div class="z">Nas duas listas</div><div class="n">${batem.length}</div><div class="p">nome, ficha e veredito da leiloeira</div></div>
      <div><div class="z">Marcados sem aprovação</div><div class="n">${pendentes.length + semFicha.length + provaveis.length}</div><div class="p">${pendentes.length} sem veredito · ${semFicha.length} sem ficha · ${provaveis.length} prováveis sem prova</div></div>
    </div>

    <h2>OS ${conferidas.length} DA PLANILHA <small>— e o que a leiloeira respondeu sobre cada um</small></h2>
    <table><thead><tr><th></th><th>Nome na planilha</th><th>Lead</th><th>Campanha</th><th>Atendeu</th><th>Ficha</th><th>Veredito real</th></tr></thead>
    <tbody>${conferidas.map(linhaConferida).join('')}</tbody></table>

    <h2>OS ${extras.length} QUE O QUADRO TEM E ESSE FILTRO NÃO MOSTRA <small>— aprovados de verdade, fora da lista</small></h2>
    <table><thead><tr><th></th><th>Nome</th><th>Lead</th><th>Campanha</th><th>Ficha</th><th>Por que não aparece</th></tr></thead>
    <tbody>${extras.map((e, i) => `<tr>
      <td class="i">${i + 1}</td>
      <td class="nome">${esc(e.nome)}</td>
      <td class="dim">${esc(e.lead)}</td>
      <td class="dim">${esc(e.campanha)}</td>
      <td class="dim">${e.ficha ? e.ficha.em.slice(8, 10) + '/' + e.ficha.em.slice(5, 7) : '—'}</td>
      <td class="nota">${esc(e.motivo)}</td></tr>`).join('')}</tbody></table>

    <div class="rodape">
      <div class="conta">${batem.length} que batem + ${extras.length} que só o quadro vê = ${APROVADOS_QUADRO.length} aprovados &nbsp;·&nbsp; ${batem.length} + ${pendentes.length} + ${semFicha.length} + ${provaveis.length} = ${conferidas.length} na planilha</div>
      <b>Nenhum dos ${conferidas.length} é de antes de agosto</b> — o filtro é pela data do lead, e todos entraram no mês. O contrário é que acontece:
      lead de julho aprovado em agosto (Davison, 31/07) sai da conta dele e entra na nossa.<br>
      <b>Onde a planilha adianta o veredito.</b> Marcionei está OK e o grupo respondeu "não tem cadastro / realizar cadastro, por favor" em 22/08;
      Ejamal foi levado em 29/08 e a leiloeira não respondeu até o fim do mês. Thyago e mendesf711 estão OK sem que nenhuma consulta tenha existido nos dois grupos.<br>
      <b>Onde a planilha atrasa.</b> Reginaldo foi aprovado em 29/08 e segue marcado NÃO RESPONDEU; a Bruna foi aprovada e não tem linha, porque entrou pela ficha do marido.<br>
      <b>As fontes são as mesmas.</b> Planilha de leads (snapshot de 31/08) e os dois grupos de cadastro lidos mensagem a mensagem com os anexos abertos — 56 fichas em agosto no total, das quais 17 casam com lead de campanha por CPF.
      <div class="assinatura">Bula Assessoria Pecuária · conferência gerada em 01/09/2026 · scripts/gera-conferencia-cadastros-agosto-2026.mjs</div>
    </div>
  </div>
</div></body></html>`

const base = path.join(saida, 'conferencia-cadastros-agosto-2026')
fs.writeFileSync(base + '.html', html)
const { chromium } = await import('playwright')
const nav = await chromium.launch()
try {
    const pg = await nav.newPage({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 2 })
    await pg.setContent(html, { waitUntil: 'networkidle' })
    const el = await pg.$('.quadro')
    await el.screenshot({ path: base + '.png' })
    const h = Math.ceil((await el.boundingBox()).height)
    await pg.pdf({ path: base + '.pdf', width: '1000px', height: `${h}px`, printBackground: true, pageRanges: '1' })
} finally { await nav.close() }

console.log(`planilha CADASTRO OK em agosto: ${conferidas.length}`)
console.log(`  aprovados de verdade ......... ${batem.length}`)
console.log(`  sem veredito ................. ${pendentes.length}  (${pendentes.map(c => c.nome).join(', ')})`)
console.log(`  sem ficha nenhuma ............ ${semFicha.length}  (${semFicha.map(c => c.nome).join(', ')})`)
console.log(`  prováveis sem prova .......... ${provaveis.length}  (${provaveis.map(c => c.nome).join(', ')})`)
console.log(`quadro: ${APROVADOS_QUADRO.length} aprovados — os ${extras.length} de fora: ${extras.map(e => e.nome).join(', ')}`)
console.log(`PDF  ${base}.pdf`)
