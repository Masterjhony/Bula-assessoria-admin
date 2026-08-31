/**
 * Renderiza "Vendas de agosto/2026 — as três fontes" a partir de
 * outputs/vendas-agosto-2026/dados.json. PDF (brandbook) + XLSX na Área de
 * Trabalho. Nenhum número escrito à mão: tudo sai do JSON da apuração.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'

const OUT = 'outputs/vendas-agosto-2026'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const mi = n => (Number(n || 0) / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'
const corta = (t, n) => { const x = String(t); if (x.length <= n) return x; const c = x.slice(0, n), sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–]+$/, '') + '…' }
/**
 * Como cada um é chamado na operação. O nome completo do cadastro não serve na
 * tabela, e cortar pelo ÚLTIMO sobrenome inventa gente que ninguém reconhece
 * ("Luiz Garcez" no lugar do Peralta, "Lucas Bragança" no lugar do Lucas
 * Martins). Quem tem apelido consagrado entra pelo apelido; o resto fica com os
 * dois primeiros nomes, que é como o grupo escreve.
 */
const APELIDO = [
    [/Peralta/i, 'Peralta'],
    [/Nane|Regiane/i, 'Nane (Regiane)'],
    [/Felipe Vilela|Bulinha/i, 'Bulinha (Felipe Andrade)'],
    [/Laila/i, 'Laila'],
    [/Rusa/i, 'Gustavo Rusa'],
]
const curto = n => {
    const s = String(n || '').trim()
    for (const [re, nome] of APELIDO) if (re.test(s)) return nome
    const p = s.split(/\s+/).filter(w => !['de', 'da', 'do', 'dos', 'das', 'e'].includes(w.toLowerCase()))
    return p.slice(0, 2).join(' ') || s
}

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', VERM = '#A33'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

/* ═══ números derivados ═══════════════════════════════════════════════════ */
const C = D.consolidado, M = D.meta, F = D.fontes
const OFICIAL = C.oficial
/** Ranking = painel (filial 2) + cobertura em pregão da Remates, por pessoa. */
const ranking = D.atribuicao.filter(a => a.total > 0).map(a => ({
    ...a, pct: a.total / OFICIAL,
}))
const TOT_LOTES = C.hp2.lotes + C.hp01_bula.lotes
const TOT_ANI = C.hp2.animais + C.hp01_bula.animais
const semFechamento = D.cruzamento.filter(c => !c.erp)
const semFechVgv = r2(semFechamento.reduce((s, c) => s + c.hp.vgv, 0))
const difLeilao = D.cruzamento.filter(c => c.dif_erp !== null && Math.abs(c.dif_erp) >= 1)
const dv = t => D.lotes_divergentes.filter(x => x.tipo === t)
const rusa = dv('atribuicao').filter(x => /Rusa/.test(x.assessor_erp || ''))
const aDefinirLote = dv('atribuicao').filter(x => /definir/i.test(x.assessor_erp || ''))
const outrosAtrib = dv('atribuicao').filter(x => !/Rusa|definir/i.test(x.assessor_erp || ''))
const rusaVgv = r2(rusa.reduce((s, x) => s + x.vgv_hp, 0))
const aDefinirVgv = r2(D.qualidade.a_definir.reduce((s, x) => s + x.vgv, 0))
const waRevisarPct = Math.round(D.qualidade.wa_a_revisar / F.whatsapp.lotes * 100)
const matinha = D.cruzamento.find(c => /MATINHA EXPOGEN/i.test(c.leilao))
const matinhaRusa = rusa.filter(x => /MATINHA/i.test(x.leilao))
const matinhaRusaVgv = r2(matinhaRusa.reduce((s, x) => s + x.vgv_hp, 0))
const naoEquipe = D.por_pessoa.hp2.filter(p => !D.atribuicao.find(a => a.pessoa === p.pessoa && (a.erp || a.hp01)) && /MOURA/i.test(p.pessoa))
const foraDaFolha = D.por_pessoa.hp2.find(p => /MOURA/i.test(p.pessoa))

/** Os maiores pregões do mês — o que puxou agosto. */
const maiores = [...D.cruzamento].sort((a, b) => b.hp.vgv - a.hp.vgv).slice(0, 6)
const maioresVgv = r2(maiores.reduce((s, c) => s + c.hp.vgv, 0))

/* ═══ por que o ERP diverge do HastaPro, pessoa a pessoa ══════════════════ */
/**
 * "ERP credita a menos" não serve para nada numa reunião — a pergunta é POR QUE.
 * Aqui a diferença de cada pessoa é decomposta nas causas que a produzem, e a
 * soma das causas é conferida contra a diferença: se não fechar, o relatório
 * diz que não fechou em vez de esconder.
 */
const somaVgv = arr => r2(arr.reduce((s, x) => s + (x.vgv_hp ?? x.vgv ?? 0), 0))
const chaveLeilao = x => `${x.leilao}|${x.data}`
const semFechSet = new Set(semFechamento.map(chaveLeilao))
const lotesTodos = [...D.lotes_detalhe.hp2, ...D.lotes_detalhe.hp01_bula]
const atrib = D.lotes_divergentes.filter(x => x.tipo === 'atribuicao')
/** Nomes sem repetir: "recebido de Douglas, Douglas, Douglas" não informa nada. */
const nomes = (arr, campo) => [...new Set(arr.map(x => curto(x[campo])))].join(' e ')

function causas(a) {
    const meus = lotesTodos.filter(l => l.pisteiro === a.pessoa)
    const c = []
    const push = (n, valor, texto) => { if (n) c.push({ n, valor, texto }) }
    const semF = meus.filter(l => semFechSet.has(chaveLeilao(l)))
    push(semF.length, -somaVgv(semF), `${semF.length} em leilão sem fechamento`)
    const pRusa = atrib.filter(x => x.assessor_hp === a.pessoa && /Rusa/.test(x.assessor_erp || ''))
    push(pRusa.length, -somaVgv(pRusa), `${pRusa.length} para o Rusa (direcionamento)`)
    const pDef = atrib.filter(x => x.assessor_hp === a.pessoa && /definir/i.test(x.assessor_erp || ''))
    push(pDef.length, -somaVgv(pDef), `${pDef.length} viraram “A definir”`)
    const pOutro = atrib.filter(x => x.assessor_hp === a.pessoa && !/Rusa|definir/i.test(x.assessor_erp || ''))
    push(pOutro.length, -somaVgv(pOutro), `${pOutro.length} creditados a ${nomes(pOutro, 'assessor_erp')}`)
    const falta = D.lotes_divergentes.filter(x => x.tipo === 'so_no_hastapro' && x.assessor_hp === a.pessoa)
    push(falta.length, -somaVgv(falta), `${falta.length} fora do fechamento`)
    const veio = atrib.filter(x => x.assessor_erp === a.pessoa && x.assessor_hp !== a.pessoa)
    push(veio.length, +somaVgv(veio), `${veio.length} recebido de ${nomes(veio, 'assessor_hp')}`)
    const soErp = D.lotes_divergentes.filter(x => x.tipo === 'so_no_erp' && x.assessor_erp === a.pessoa)
    push(soErp.length, +r2(soErp.reduce((s, x) => s + (x.vgv_erp || 0), 0)), `${soErp.length} que só existe no ERP`)
    const extra = D.erp_sem_par.flatMap(f => f.por_assessor.filter(p => p.pessoa === a.pessoa))
    push(extra.length, +r2(extra.reduce((s, p) => s + p.vgv, 0)), `${extra.length} em fechamento sem par no HastaPro`)
    const total = r2(c.reduce((s, x) => s + x.valor, 0))
    const dif = r2(a.erp - a.total)
    return { itens: c, total, dif, fecha: Math.abs(total - dif) < 1 }
}
const decomposicao = D.atribuicao.filter(a => a.total > 0 || a.erp > 0).map(a => ({ a, ...causas(a) }))
const todasFecham = decomposicao.every(d => Math.abs(d.dif) < 1 || d.fecha)

/** Percentual da folha (2 = 2%). Nunca inferir do nome — ver o quadro na p. 7. */
const pct = nome => (D.comissao_pct?.[nome] ?? 0) / 100

const foot = n => `<div class="pfoot"><span>Bula Assessoria Pecuária · Vendas de agosto de 2026 · três fontes</span><span>${n}</span></div>`

/* ═══ gráfico: a meta ═════════════════════════════════════════════════════ */
function gMeta() {
    /* BW deixa ~104px livres à direita: o rótulo do valor fica FORA da barra e
     * a maior delas não pode empurrá-lo para fora do viewBox. */
    const W = 762, X0 = 0, BW = W - 104, PASSO = 38
    const linhas = [
        { v: OFICIAL, cor: INK, rot: 'REALIZADO — PAINEL + COBERTURA REMATES', sub: `${M.pct_agenda_divulgada.toFixed(2).replace('.', ',')}% da agenda divulgada · ${M.pct_agenda_completa.toFixed(2).replace('.', ',')}% da completa` },
        { v: M.so_painel.realizado, cor: '#5A5A5A', rot: 'REALIZADO — SÓ O PAINEL (FILIAL ‘2’)', sub: `${M.so_painel.pct_agenda_divulgada.toFixed(2).replace('.', ',')}% da agenda divulgada — abaixo dos 12%` },
        { v: M.alvo_agenda_divulgada, cor: GOLD, rot: 'META 12% — AGENDA DIVULGADA', sub: 'base R$ 57,29 mi, a agenda que circulou no grupo' },
        { v: M.alvo_agenda_completa, cor: '#C9C9C9', rot: 'META 12% — AGENDA COMPLETA', sub: 'base R$ 68,02 mi, com os dois leilões da Mafra que o SOMA da planilha deixava de fora' },
    ]
    const max = Math.max(...linhas.map(l => l.v))
    const px = v => (v / max) * BW
    return `<svg viewBox="0 0 ${W} ${linhas.length * PASSO - 4}" width="100%" role="img" aria-label="As duas leituras do realizado de agosto contra os dois alvos possíveis da meta de 12%">
    ${linhas.map((l, i) => {
        const y = i * PASSO
        return `<rect x="${X0}" y="${y}" width="${px(l.v)}" height="20" fill="${l.cor}" rx="2"/>
      <text x="${px(l.v) + 8}" y="${y + 14}" font-family="Oswald" font-size="12.5" font-weight="600" fill="${INK}">R$ ${mi(l.v)} mi</text>
      <text x="${X0 + 7}" y="${y + 14}" font-family="Oswald" font-size="9.4" font-weight="600" fill="#fff" letter-spacing=".06em">${l.rot}</text>
      <text x="${X0}" y="${y + 33}" font-family="Inter" font-size="8.4" fill="${MUTED}">${l.sub}</text>`
    }).join('')}
  </svg>`
}

/* ═══ CSS (brandbook) ═════════════════════════════════════════════════════ */
const CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 10.2px; line-height: 1.52; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3 { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 13mm 17mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 7mm; font-size: 7.4px; color: #A6A6A6; display: flex; justify-content: space-between; border-top: 1px solid ${GRID}; padding-top: 2mm; }
  .capa { background: ${INK}; color: #fff; padding: 32mm 20mm 20mm; display: flex; flex-direction: column; }
  .capa img { width: 42mm; margin-bottom: 24mm; }
  .capa h1 { font-size: 40px; line-height: 1.05; color: #fff; font-weight: 700; }
  .capa .sub { font-size: 12.4px; color: #B5B5B5; margin-top: 8mm; max-width: 140mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
  .capa .rule { width: 26mm; height: 3px; background: ${GOLD}; margin: 9mm 0; }
  .capa .meta { margin-top: auto; flex-wrap: wrap; row-gap: 6mm; display: flex; gap: 11mm; border-top: 1px solid #2A2A2A; padding-top: 6mm; }
  .capa .meta div span { display: block; font-size: 8.5px; color: #8A8A8A; text-transform: uppercase; letter-spacing: .09em; margin-bottom: 2px; }
  .capa .meta div strong { font-size: 12px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${INK}; padding-bottom: 3mm; margin-bottom: 6mm; }
  .head h2 { font-size: 21px; }
  .head .n { font-size: 9px; color: ${MUTED}; letter-spacing: .12em; text-transform: uppercase; font-family: Oswald, sans-serif; }
  h3 { font-size: 12.5px; margin: 6mm 0 2mm; }
  h3:first-of-type { margin-top: 0; }
  p { margin: 0 0 3mm; }
  .lead { font-size: 11.4px; line-height: 1.58; }
  strong { font-weight: 600; }
  .muted { color: ${MUTED}; }
  .small { font-size: 8.8px; color: ${MUTED}; line-height: 1.45; margin-top: -1mm; }
  .tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin: 4mm 0 6mm; }
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.4mm 3.4mm 3mm; }
  .tile .k { font-size: 8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.6mm; line-height: 1.3; min-height: 5.6mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 19px; font-weight: 600; line-height: 1; }
  .tile .v .cur { font-size: 11px; font-weight: 500; color: ${MUTED}; margin-right: 1px; }
  .tile .d { font-size: 8.4px; color: ${MUTED}; margin-top: 1.6mm; line-height: 1.4; }
  .tile.gold { border-top-color: ${GOLD}; }
  .box { border: 1px solid ${GRID}; padding: 4mm 4.4mm; margin: 4mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.dark p, .box.dark li { color: #D8D8D8; }
  .box.dark strong { color: #fff; }
  .box.rule { border: none; border-left: 3px solid ${INK}; padding: 1mm 0 1mm 4mm; }
  .box.gold { border-left: 3px solid ${GOLD}; border-top: none; border-right: none; border-bottom: none; padding: 1mm 0 1mm 4mm; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2.2mm; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 9.3px; margin: 2.5mm 0; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.4px; letter-spacing: .07em; font-weight: 600; border-bottom: 1.4px solid ${INK}; padding: 2mm 1.8mm; }
  td { padding: 1.6mm 1.8mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  tr.sub td { background: #FAFAFA; font-weight: 600; }
  .neg { color: ${VERM}; }
  .tag { display: inline-block; font-family: Oswald, sans-serif; font-size: 7.4px; letter-spacing: .07em; text-transform: uppercase; border: 1px solid ${GRID}; padding: .4mm 1.4mm; color: ${MUTED}; white-space: nowrap; }
  .tag.ok { border-color: ${INK}; color: ${INK}; }
  .tag.warn { border-color: ${GOLD}; color: #8A7024; background: #FCF8EE; }
  figure { margin: 3mm 0 5mm; }
  figcaption { font-size: 8.6px; color: ${MUTED}; margin-top: 1.8mm; line-height: 1.45; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  /* A tabela de 29 leilões só cabe em A4 com a linha mais apertada. */
  table.dense td { padding: 1.05mm 1.8mm; }
  table.dense th { padding: 1.5mm 1.8mm; }
  table.dense .tag { padding: .2mm 1.2mm; }`

/* ═══ tabelas ═════════════════════════════════════════════════════════════ */
const linhasRanking = ranking.map(a => `
  <tr>
    <td>${esc(curto(a.pessoa))}</td>
    <td class="num">R$ ${brl(a.hp2)}</td>
    <td class="num">${a.hp2_lotes || '—'}</td>
    <td class="num">${a.hp01 ? 'R$ ' + brl(a.hp01) : '—'}</td>
    <td class="num"><strong>R$ ${brl(a.total)}</strong></td>
    <td class="num">${(a.pct * 100).toFixed(1).replace('.', ',')}%</td>
    <td class="num">${a.hp2_animais + a.hp01_animais}</td>
  </tr>`).join('')

const linhasFontes = decomposicao.map(({ a, itens, dif, fecha }) => `
  <tr>
    <td>${esc(curto(a.pessoa))}</td>
    <td class="num">R$ ${brl(a.total)}</td>
    <td class="num">${a.erp ? 'R$ ' + brl(a.erp) : '—'}</td>
    <td class="num">${a.wa ? 'R$ ' + brl(a.wa) : '—'}</td>
    <td class="num">${Math.abs(dif) < 1 ? '—' : (dif > 0 ? '+' : '−') + 'R$ ' + brl0(Math.abs(dif))}</td>
    <td>${Math.abs(dif) < 1 ? 'as três fontes concordam'
        : itens.length ? esc(itens.map(i => i.texto).join(' · ')) + (fecha ? '' : ' <span class="tag warn">não fecha</span>')
            : '<span class="tag warn">causa não identificada</span>'}</td>
  </tr>`).join('')

const linhasCruz = D.cruzamento.map(c => {
    const st = !c.erp ? '<span class="tag warn">sem fechamento</span>'
        : Math.abs(c.dif_erp) >= 1 ? `<span class="tag warn">dif R$ ${brl0(Math.abs(c.dif_erp))}</span>`
            : '<span class="tag ok">confere</span>'
    return `<tr>
    <td class="num">${dm(c.data)}</td>
    <td>${esc(corta(c.leilao, 44))}${c.filial === '01' ? ' <span class="tag">Remates</span>' : ''}</td>
    <td class="num">R$ ${brl(c.hp.vgv)}</td>
    <td class="num">${c.hp.lotes}</td>
    <td class="num">${c.erp ? 'R$ ' + brl(c.erp.vgv) : '—'}</td>
    <td class="num">${c.wa ? c.wa.lotes : '—'}</td>
    <td>${st}</td>
  </tr>`
}).join('')

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Bula — Vendas de agosto de 2026</title>
<style>${CSS}</style></head><body>

<!-- ══ CAPA ══ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Vendas de<br>agosto</h1>
  <div class="rule"></div>
  <div class="sub">O mês fechado pelas <strong>três fontes</strong> — HastaPro, web-bula e os grupos de
  lances do WhatsApp — com o ranking por assessor, a meta e <strong>cada divergência entre as bases</strong>
  apontada leilão a leilão e lote a lote.</div>
  <div class="meta">
    <div><span>Vendas de agosto</span><strong>R$ ${brl(OFICIAL)}</strong></div>
    <div><span>Lotes · animais</span><strong>${TOT_LOTES} · ${TOT_ANI}</strong></div>
    <div><span>Meta 12%</span><strong>${M.bateu_divulgada && !M.so_painel.bateu_divulgada ? 'depende do critério' : M.bateu_divulgada ? 'batida' : 'não batida'}</strong></div>
    <div><span>Pendente de lançamento</span><strong>R$ ${brl(C.wa_pendente.vgv)}</strong></div>
    <div><span>Emitido em</span><strong>${dm(D.geradoEm.slice(0, 10))}/${D.geradoEm.slice(0, 4)}</strong></div>
  </div>
</section>

<!-- ══ 1. O NÚMERO ══ -->
<section class="page">
  <div class="head"><h2>O número de agosto</h2><div class="n">01 · Consolidado</div></div>

  <p class="lead">A Bula Assessoria vendeu <strong>R$ ${brl(OFICIAL)}</strong> em agosto —
  <strong>${TOT_LOTES} lotes</strong> e <strong>${TOT_ANI} animais</strong>. São duas parcelas:
  <strong>R$ ${brl(C.hp2.vgv)}</strong> na filial ‘2’ do HastaPro (o painel que circula no grupo) e
  <strong>R$ ${brl(C.hp01_bula.vgv)}</strong> de cobertura dentro de pregões da própria Bula Remates,
  que o painel nunca mostra.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Filial ‘2’ — o painel</div>
      <div class="v"><span class="cur">R$</span>${brl0(C.hp2.vgv)}</div>
      <div class="d">${F.hastapro_fil2.leiloes} leilões · ${C.hp2.lotes} lotes</div></div>
    <div class="tile"><div class="k">Cobertura em pregão da Remates</div>
      <div class="v"><span class="cur">R$</span>${brl0(C.hp01_bula.vgv)}</div>
      <div class="d">${F.hastapro_fil01_bula.leiloes} leilões · ${C.hp01_bula.lotes} lotes</div></div>
    <div class="tile gold"><div class="k">Total de agosto</div>
      <div class="v"><span class="cur">R$</span>${brl0(OFICIAL)}</div>
      <div class="d">é este o número da reunião</div></div>
    <div class="tile"><div class="k">Ainda só no WhatsApp</div>
      <div class="v"><span class="cur">R$</span>${brl0(C.wa_pendente.vgv)}</div>
      <div class="d">${C.wa_pendente.lotes} lotes sem lançamento no HastaPro</div></div>
  </div>

  <h3>A meta de 12%: três leituras, dois resultados</h3>
  <figure>${gMeta()}<figcaption>A meta de agosto foi fixada em <strong>12% de cobertura</strong> (Marcelo, 04/08).
  Ela bate ou não bate conforme <em>o que se conta como venda</em> e <em>sobre qual agenda</em> — e as duas escolhas
  ainda não foram feitas.</figcaption></figure>

  <div class="box dark">
    <div class="t">A resposta para os assessores — e a decisão que falta</div>
    <p><strong>Contando tudo o que a Bula vendeu</strong> (painel + cobertura em pregão da Remates) sobre a agenda
    divulgada: <strong>R$ ${brl0(OFICIAL)} = ${M.pct_agenda_divulgada.toFixed(2).replace('.', ',')}%</strong>. A meta está
    batida, com folga de R$ ${brl0(OFICIAL - M.alvo_agenda_divulgada)}.</p>
    <p><strong>Mas se a meta vinha sendo acompanhada pelo painel</strong> — que é o quadro que circula no grupo e
    <strong>não enxerga a cobertura em pregão da Remates</strong> — agosto fecha em
    <strong>R$ ${brl0(M.so_painel.realizado)} = ${M.so_painel.pct_agenda_divulgada.toFixed(2).replace('.', ',')}%</strong>,
    e <strong>não bate</strong>. Sobre a agenda completa, nenhuma das duas bate
    (${M.pct_agenda_completa.toFixed(2).replace('.', ',')}%).</p>
    <p style="margin-bottom:0"><strong>São R$ ${brl0(C.hp01_bula.vgv)} que decidem o mês.</strong> É venda real, com
    lote, comprador e comissão — só não aparece no painel. <strong>Decidir antes da reunião</strong> se ela conta:
    a equipe não pode ouvir “batemos” hoje e “não batemos” quando alguém abrir o painel.</p>
  </div>

  <h3>Os pregões que fizeram o mês</h3>
  <table>
    <tr><th class="num">Data</th><th>Leilão</th><th class="num">Venda Bula</th><th class="num">Lotes</th><th class="num">% do mês</th></tr>
    ${maiores.map(c => `<tr><td class="num">${dm(c.data)}</td>
      <td>${esc(corta(c.leilao, 48))}${c.filial === '01' ? ' <span class="tag">Remates</span>' : ''}</td>
      <td class="num">R$ ${brl(c.hp.vgv)}</td><td class="num">${c.hp.lotes}</td>
      <td class="num">${(c.hp.vgv / OFICIAL * 100).toFixed(1).replace('.', ',')}%</td></tr>`).join('')}
    <tr class="total"><td></td><td>Os ${maiores.length} maiores</td><td class="num">R$ ${brl(maioresVgv)}</td>
      <td class="num">${maiores.reduce((s, c) => s + c.hp.lotes, 0)}</td>
      <td class="num">${(maioresVgv / OFICIAL * 100).toFixed(0)}%</td></tr>
  </table>
  <p class="small">Seis pregões respondem por ${(maioresVgv / OFICIAL * 100).toFixed(0)}% de agosto. A Expogenética
  (15 a 23/08) concentra a maior parte do restante, pulverizada em lotes menores.</p>
  ${foot('Página 2 de 8')}
</section>

<!-- ══ 2. RANKING ══ -->
<section class="page">
  <div class="head"><h2>Quem vendeu</h2><div class="n">02 · Ranking por assessor</div></div>

  <p class="lead">Atribuição pelo <strong>pisteiro do lote no HastaPro</strong> — é o registro de quem estava
  na pista. Douglas e Fábio respondem por
  <strong>${(((ranking[0]?.total || 0) + (ranking[1]?.total || 0)) / OFICIAL * 100).toFixed(0)}%</strong> do mês.</p>

  <table>
    <tr><th>Assessor</th><th class="num">Filial ‘2’</th><th class="num">Lotes</th>
        <th class="num">Pregão Remates</th><th class="num">Total agosto</th><th class="num">% do mês</th><th class="num">Animais</th></tr>
    ${linhasRanking}
    <tr class="total"><td>Total</td><td class="num">R$ ${brl(C.hp2.vgv)}</td><td class="num">${C.hp2.lotes}</td>
      <td class="num">R$ ${brl(C.hp01_bula.vgv)}</td><td class="num">R$ ${brl(OFICIAL)}</td>
      <td class="num">100%</td><td class="num">${TOT_ANI}</td></tr>
  </table>

  <div class="cols2">
    <div class="box">
      <div class="t">Por que o Peralta, a Laila, o Lucas e o Bulinha aparecem pequenos</div>
      <p style="margin:0">Os quatro venderam muito mais em agosto — <strong>R$ ${brl(F.hastapro_fil01_pela_remates.vgv)}</strong>
      em ${F.hastapro_fil01_pela_remates.lotes} lotes — mas <strong>dentro de pregões da própria Bula Remates</strong>,
      onde estão na pista pela Remates e não pela Assessoria (regra do João, 26/08). Esse volume
      <strong>não é cobertura da Assessoria</strong> e por isso não entra aqui nem comissiona.
      É o mesmo critério que segura o São Geraldo de 01/08 em R$ 375.800 e não em R$ 1,83 milhão.</p>
    </div>
    <div class="box">
      <div class="t">A linha em branco do painel é a Nane</div>
      <p style="margin:0">O painel resolve o pisteiro só na tabela <em>PRESTADORES</em>; a Nane existe apenas em
      <em>CLIENTES</em> (<strong>Regiane Cristina Neves de Abreu</strong>) e por isso sai sem nome.
      Aqui ela aparece com <strong>R$ ${brl(ranking.find(a => /Nane/.test(a.pessoa))?.total || 0)}</strong>.
      O mesmo furo custou dinheiro de verdade: <strong>R$ ${brl(dv('so_no_hastapro').filter(x => /Nane/.test(x.assessor_hp)).reduce((s, x) => s + x.vgv_hp, 0))}</strong>
      dela ficaram fora do fechamento do São Geraldo. <strong>Cadastrar a Nane em PRESTADORES resolve na origem.</strong></p>
    </div>
  </div>

  <div class="box gold">
    <div class="t">Um nome no ranking que não é da equipe</div>
    <p style="margin:0">O lote 22 do 28º Naviraí Camparino (23/08), <strong>R$ ${brl(foraDaFolha?.vgv || 0)}</strong>, está
    no HastaPro com o pisteiro <strong>MARCELO MOURA</strong> — que não está na folha da Bula. A ficha do grupo
    explica: <em>“Foi com Marcelo Moura e Claudinho, eles são clientes preferências Naviraí”</em>. É o caso clássico
    de <strong>o comprador entrar como pisteiro</strong>. Ou o lote tem um assessor de verdade a atribuir, ou não é
    cobertura da Bula — e nos dois casos o número de agosto muda. <strong>Decisão do Marcelo.</strong></p>
  </div>

  <h3>O volume vendido pela Bula Remates — R$ ${brl(F.hastapro_fil01_pela_remates.vgv)}</h3>
  <table class="dense">
    <tr><th>Assessor</th><th class="num">Vendido em pregão da Remates</th><th class="num">Lotes</th>
        <th class="num">Animais</th><th>Como entra em agosto</th></tr>
    ${F.hastapro_fil01_pela_remates.por_pessoa.map(p => `<tr><td>${esc(curto(p.pessoa))}</td>
      <td class="num">R$ ${brl(p.vgv)}</td><td class="num">${p.lotes}</td><td class="num">${p.animais}</td>
      <td>Fora da cobertura da Assessoria${/Felipe Vilela/.test(p.pessoa) ? ' — e em leilão da própria Remates o Bulinha recebe 0%' : ''}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td class="num">R$ ${brl(F.hastapro_fil01_pela_remates.vgv)}</td>
      <td class="num">${F.hastapro_fil01_pela_remates.lotes}</td>
      <td class="num">${F.hastapro_fil01_pela_remates.por_pessoa.reduce((s, p) => s + p.animais, 0)}</td><td></td></tr>
  </table>
  <p class="small">O número pequeno dos quatro no ranking não mede o esforço — mede só o que é cobertura da
  Assessoria. Se a diretoria quiser comissionar pregão da Remates, é <strong>esta</strong> a base a discutir.</p>
  ${foot('Página 3 de 8')}
</section>

<!-- ══ 3. AS TRÊS FONTES ══ -->
<section class="page">
  <div class="head"><h2>As três fontes</h2><div class="n">03 · O que cada uma enxerga</div></div>

  <p class="lead">As três bases <strong>não medem a mesma coisa</strong>, e é por isso que nunca fecham sozinhas.
  Este relatório usa o HastaPro para o valor e a atribuição, o ERP para achar o que falta, e o WhatsApp para
  saber o que já vendeu e ainda não foi lançado.</p>


  <table>
    <tr><th>Fonte</th><th>O que é</th><th class="num">Volume</th><th>O que só ela sabe</th><th>Risco</th></tr>
    <tr><td><strong>HastaPro</strong><br><span class="muted">filial ‘2’</span></td>
      <td>Lotes da Bula Assessoria, com pisteiro e valor</td>
      <td class="num">R$ ${brl(F.hastapro_fil2.vgv)}</td>
      <td>O valor correto do lote (<em>LOT_TOTAL</em>, já com parcelas e quantidade)</td>
      <td>Só enxerga o que já foi lançado</td></tr>
    <tr><td><strong>HastaPro</strong><br><span class="muted">filial ‘01’</span></td>
      <td>Pregões da Bula Remates; a cobertura da Assessoria está dentro</td>
      <td class="num">R$ ${brl(F.hastapro_fil01_bula.vgv)}</td>
      <td>Venda da Assessoria que o painel não mostra</td>
      <td>Somar a filial inteira infla ${mi(F.hastapro_fil01_total.vgv)} mi</td></tr>
    <tr><td><strong>web-bula</strong><br><span class="muted">ERP · fechamentos</span></td>
      <td>${F.erp.fechamentos} fechamentos de agosto, com acordo e comissão</td>
      <td class="num">R$ ${brl(F.erp.vgv)}</td>
      <td>Comissão, acordo e receita por leilão</td>
      <td>Atribuição por assessor não é confiável</td></tr>
    <tr><td><strong>WhatsApp</strong><br><span class="muted">grupos de lances</span></td>
      <td>${F.whatsapp.lotes} fichas capturadas em ${F.whatsapp.dias} dias de pregão</td>
      <td class="num">R$ ${brl(F.whatsapp.vgv_indicativo)} <span class="muted">indic.</span></td>
      <td>A venda nas primeiras 24–48h, antes de qualquer lançamento</td>
      <td>${waRevisarPct}% das fichas estão “a revisar”</td></tr>
  </table>

  <h3>O mesmo mês, pessoa a pessoa, nas três bases</h3>
  <table>
    <tr><th>Assessor</th><th class="num">HastaPro</th><th class="num">ERP</th><th class="num">WhatsApp</th>
        <th class="num">Diferença</th><th>De onde vem a diferença</th></tr>
    ${linhasFontes}
  </table>
  <p class="small">HastaPro = filial ‘2’ + cobertura em pregão da Remates. WhatsApp é indicativo (parcela × 30 × animais)
  e conta duplicidade — serve para ver <em>o que existe</em>, nunca para somar dinheiro.
  ${todasFecham ? '<strong>Todas as diferenças fecham ao centavo</strong> pelas causas listadas: não há divergência inexplicada em agosto.'
        : '<strong>Atenção:</strong> ao menos uma diferença não é explicada pelas causas listadas.'}</p>
  ${foot('Página 4 de 8')}
</section>

<!-- ══ 4. DIVERGÊNCIAS POR LEILÃO ══ -->
<section class="page">
  <div class="head"><h2>Leilão a leilão</h2><div class="n">04 · Divergências</div></div>

  <p class="lead">Dos ${D.cruzamento.length} leilões com venda da Bula em agosto,
  <strong>${D.cruzamento.length - difLeilao.length - semFechamento.length} fecham exatos</strong> contra o ERP.
  Sobram <strong>${difLeilao.length} com diferença de valor</strong> e
  <strong>${semFechamento.length} sem fechamento nenhum</strong> — R$ ${brl(semFechVgv)} de venda registrada no
  HastaPro que o ERP ainda não conhece.</p>

  <table class="dense">
    <tr><th class="num">Data</th><th>Leilão</th><th class="num">HastaPro</th><th class="num">Lotes</th>
        <th class="num">ERP</th><th class="num">Fichas</th><th>Situação</th></tr>
    ${linhasCruz}
    <tr class="total"><td></td><td>Total</td><td class="num">R$ ${brl(OFICIAL)}</td><td class="num">${TOT_LOTES}</td>
      <td class="num">—</td><td class="num">—</td><td></td></tr>
  </table>
  <p class="small">“Fichas” é quantas mensagens de venda o grupo de lances registrou naquele dia — não casa
  um-para-um com o leilão porque vários pregões correm no mesmo dia, sobretudo na Expogenética.</p>
  ${foot('Página 5 de 8')}
</section>

<!-- ══ 5. AS DIFERENÇAS EXPLICADAS ══ -->
<section class="page">
  <div class="head"><h2>De onde vem cada diferença</h2><div class="n">05 · Causa a causa</div></div>

  <h3>As três diferenças de valor, explicadas</h3>
  <table>
    <tr><th>Leilão</th><th class="num">Diferença</th><th>Causa exata</th></tr>
    <tr><td>${esc(corta(difLeilao.find(c => /SÃO GERALDO/i.test(c.leilao))?.leilao || '', 40))} <span class="muted">01/08</span></td>
      <td class="num neg">−R$ ${brl0(Math.abs(difLeilao.find(c => /SÃO GERALDO/i.test(c.leilao))?.dif_erp || 0))}</td>
      <td>Os <strong>2 lotes da Nane</strong> (14 e 23) ficaram fora do fechamento. O importador procura o pisteiro
      em <em>PRESTADORES</em> e não acha “Regiane”. Além do VGV, some a comissão dela.</td></tr>
    <tr><td>Naviraí Camparino Matrizes <span class="muted">22/08</span></td>
      <td class="num">+R$ ${brl0(difLeilao.find(c => /MATRIZES ESS/i.test(c.leilao))?.dif_erp || 0)}</td>
      <td>O ERP tem um <strong>lote 9 de R$ ${brl0(dv('so_no_erp').find(x => x.lote == 9)?.vgv_erp || 0)}</strong> (Douglas)
      que não existe nesse leilão no HastaPro. Conferir se é o lote 59 do dia 23, de mesmo valor e mesmo assessor,
      lançado no fechamento errado.</td></tr>
    <tr><td>28º Naviraí Camparino <span class="muted">23/08</span></td>
      <td class="num">+R$ ${brl0(difLeilao.find(c => /28º/.test(c.leilao))?.dif_erp || 0)}</td>
      <td><strong>Fecha ao centavo por três erros que se cancelam:</strong> faltam o lote 12 (Leonardo, R$ 49.500)
      e o 78 (Peralta, R$ 48.000), e sobra o <strong>lote 21 de R$ 105.000</strong>, que é do
      <strong>6º Excelência Genética</strong> — o único leilão de agosto sem fechamento próprio.</td></tr>
  </table>

  <div class="box gold">
    <div class="t">Os ${semFechamento.length} leilões sem fechamento — R$ ${brl(semFechVgv)}</div>
    <p style="margin:0">${semFechamento.map(c => `<strong>${dm(c.data)}</strong> ${esc(corta(c.leilao, 40))} — R$ ${brl0(c.hp.vgv)}`).join(' · ')}.
    Cinco deles são de <strong>26 e 30/08</strong>: pregões que aconteceram depois do último fechamento gerado.
    Rodar o importador fecha os ${semFechamento.length} de uma vez.</p>
  </div>

  <h3>A qualidade da fonte WhatsApp</h3>
  <p>Das <strong>${F.whatsapp.lotes} fichas</strong> capturadas nos grupos em agosto,
  <strong>${D.qualidade.wa_a_revisar} continuam marcadas “a revisar”</strong> (${waRevisarPct}%) e
  <strong>${D.qualidade.wa_sem_assessor.n} chegaram sem vendedor</strong>. Só parte delas foi mal postada: em boa parte
  <strong>o nome está escrito e o parser não leu</strong>, porque a ficha fugiu do formato
  <em>“Foi com &lt;nome&gt; da Bula Assessoria”</em> — “Com Lucas Martins - Bula Assessoria” e
  “Peralta / BULA” passam batido. É o que produz a linha “sem assessor na ficha”.</p>

  <table class="dense">
    <tr><th class="num">Data</th><th class="num">Lote</th><th>Ficha registrada no grupo, com o vendedor não extraído</th></tr>
    ${D.qualidade.wa_sem_assessor.itens.map(v => `<tr><td class="num">${dm(v.data)}</td>
      <td class="num">${esc(v.lote)}</td><td>${esc(corta(v.trecho, 92))}</td></tr>`).join('')}
  </table>
  <p class="small">Nenhuma venda se perdeu por isso — quase todas têm lote correspondente no HastaPro, que é quem
  carrega o pisteiro. São <strong>duas correções distintas</strong>: ensinar o parser as variantes acima, e padronizar
  a postagem no grupo. Enquanto as duas não forem feitas, o lote nasce sem dono e alguém tem de cruzar à mão.</p>
  ${foot('Página 6 de 8')}
</section>

<!-- ══ 6. LOTE A LOTE ══ -->
<section class="page">
  <div class="head"><h2>Lote a lote</h2><div class="n">06 · Onde mora a comissão</div></div>

  <p class="lead">O total do leilão bater não prova que os lotes batem — e é no lote que a comissão é calculada.
  Comparando lance a lance nos fechamentos que guardam esse detalhe:
  <strong>${dv('so_no_hastapro').length} lotes</strong> existem no HastaPro e não no ERP,
  <strong>${dv('so_no_erp').length}</strong> só no ERP, e
  <strong>${dv('atribuicao').length} estão no nome de outra pessoa</strong> em cada base.</p>

  <h3>Lotes que faltam no fechamento — R$ ${brl(D.resumo_lotes.so_no_hastapro.vgv)}</h3>
  <table>
    <tr><th class="num">Data</th><th>Leilão</th><th class="num">Lote</th><th class="num">VGV</th><th>Assessor (HastaPro)</th><th class="num">Comissão em risco</th></tr>
    ${dv('so_no_hastapro').map(x => `<tr><td class="num">${dm(x.data)}</td><td>${esc(corta(x.leilao, 36))}</td>
      <td class="num">${esc(x.lote)}</td><td class="num">R$ ${brl(x.vgv_hp)}</td><td>${esc(curto(x.assessor_hp))}</td>
      <td class="num">R$ ${brl(x.vgv_hp * pct(x.assessor_hp))} <span class="muted">${(pct(x.assessor_hp) * 100).toLocaleString('pt-BR')}%</span></td></tr>`).join('')}
    <tr class="total"><td></td><td>Total</td><td class="num"></td><td class="num">R$ ${brl(D.resumo_lotes.so_no_hastapro.vgv)}</td><td></td>
      <td class="num">R$ ${brl(dv('so_no_hastapro').reduce((s, x) => s + x.vgv_hp * pct(x.assessor_hp), 0))}</td></tr>
  </table>
  <p class="small">O assessor vendeu, o HastaPro registrou e o fechamento não viu — logo não virou título de comissão.
  Foi exatamente assim que a comissão do Douglas fechou R$ 1.602 a menos em julho, e só apareceu porque ele reclamou.</p>

  <h3>Atribuição divergente — ${dv('atribuicao').length} lotes, R$ ${brl(D.resumo_lotes.atribuicao.vgv)}</h3>
  <div class="cols2">
    <div class="box">
      <div class="t">${rusa.length} lotes · R$ ${brl0(rusaVgv)} — <span style="color:${INK}">não é erro</span></div>
      <p>O HastaPro credita quem estava na pista (Douglas e Fábio); o ERP credita o
      <strong>Gustavo Rusa</strong>, porque o comprador é cliente dirigido dele — as fichas do grupo escrevem
      <em>“com direcionamento técnico Gustavo Rusa”</em> com todas as letras.</p>
      <p style="margin-bottom:0"><strong>As duas bases estão certas para finalidades diferentes:</strong>
      o ranking de vendas é do pisteiro, a comissão de 5% é do Rusa. Só não podem ser somadas.</p>
    </div>
    <div class="box">
      <div class="t">${aDefinirLote.length + outrosAtrib.length} lotes que precisam de decisão</div>
      <ul style="margin-bottom:0">
        ${aDefinirLote.map(x => `<li><strong>lt ${esc(x.lote)}</strong> · R$ ${brl0(x.vgv_hp)} — o ERP diz “A definir”;
          o HastaPro diz <strong>${esc(curto(x.assessor_hp))}</strong>.</li>`).join('')}
        ${outrosAtrib.map(x => `<li><strong>lt ${esc(x.lote)}</strong> · R$ ${brl0(x.vgv_hp)} — HastaPro:
          <strong>${esc(curto(x.assessor_hp))}</strong> × ERP: <strong>${esc(curto(x.assessor_erp))}</strong>.</li>`).join('')}
      </ul>
    </div>
  </div>
  <p class="small">“A definir” soma <strong>R$ ${brl(aDefinirVgv)}</strong> nos fechamentos de agosto: lote vendido,
  comissão sem dono. <strong>Todos se resolvem olhando o pisteiro no HastaPro</strong> — nenhum depende de decisão nova.
  ⚠ Ao atribuir os dois lotes do <strong>Lucas Martins</strong>, atenção ao percentual: a folha tem
  <strong>${(D.comissao_pct['Lucas Martins Durães Bragança'] ?? 0).toLocaleString('pt-BR')}%</strong> no nome dele,
  mas o Grupo Financeiro fixou <strong>1%</strong> em 05/08. Os R$ ${brl0(96000)} valem R$ 316,80 ou R$ 960 conforme
  qual dos dois valer.</p>

  <h3>O que o grupo registrou e o HastaPro não tem</h3>
  <table>
    <tr><th class="num">Data</th><th class="num">Lote</th><th class="num">VGV indicativo</th>
        <th>Assessor na ficha</th><th>Situação real — e o que fazer</th></tr>
    ${D.whatsapp.pendentes.map(v => `<tr><td class="num">${dm(v.data)}</td><td class="num">${esc(v.lote)}</td>
      <td class="num">R$ ${brl(v.vgv_indicativo)}</td><td>${esc(v.assessor ? curto(v.assessor) : '— não extraído')}</td>
      <td>${v.mesmo_lote_e_valor_no_mes
        ? `<strong>Provável duplicidade.</strong> O mesmo lote ${esc(v.mesmo_lote_e_valor_no_mes.lote)}, de mesmo valor,
           já está no <strong>${esc(corta(v.mesmo_lote_e_valor_no_mes.leilao, 30))}</strong> de
           ${dm(v.mesmo_lote_e_valor_no_mes.data)} — repostado num segundo grupo virou o fechamento
           “${esc(v.fechamento_no_erp?.nome || '—')}”. <strong>Conferir e apagar o fechamento duplicado.</strong>`
        : v.fechamento_no_erp
            ? `Já tem fechamento no ERP (<strong>${esc(corta(v.fechamento_no_erp.nome, 32))}</strong>, origem
               ${esc(v.fechamento_no_erp.origem)}), mas <strong>não existe no HastaPro</strong>.
               Lançar lá para o lote virar comissão auditável.`
            : `<strong>Não está em nenhuma das outras duas bases.</strong> Confirmar a venda com o assessor
               — a ficha não traz o vendedor e o valor é estimado pela parcela.`}</td></tr>`).join('')}
  </table>
  <p class="small">Outros <strong>${C.wa_eco.lotes} lotes</strong> (R$ ${brl(C.wa_eco.vgv)}) pareciam faltar e
  <strong>já estão lançados com outra numeração</strong> — o pacote de embriões postado como “lt 11” é o lote “E11”
  do Matinha, e o “ASP 5217” é o lote 35 do Santa Nice. Foram conferidos por valor e retirados da lista.</p>
  ${foot('Página 7 de 8')}
</section>

<!-- ══ 7. AÇÕES ══ -->
<section class="page">
  <div class="head"><h2>Para fechar agosto</h2><div class="n">07 · Decisões e ações</div></div>

  <p class="lead">Nada aqui muda o número principal de agosto: <strong>R$ ${brl(OFICIAL)}</strong>. O que muda é
  <strong>quem recebe comissão</strong> e <strong>quanto a Bula fatura</strong> — e as duas coisas ainda estão abertas.</p>

  <div class="box dark">
    <div class="t">O buraco entre a comissão e a receita</div>
    <p>Os fechamentos de agosto comprometem <strong>R$ ${brl(D.financeiro.comissao_assessores)}</strong> de comissão
    aos assessores. A receita reconhecida da Bula nesses mesmos fechamentos é de
    <strong>R$ ${brl(D.financeiro.receita_bula)}</strong> — mas concentrada nos leilões até 09/08.</p>
    <p style="margin-bottom:0"><strong>${D.financeiro.fechamentos_sem_receita.length} fechamentos estão com receita zerada</strong>,
    carregando <strong>R$ ${brl(D.financeiro.comissao_sem_receita)}</strong> de comissão — praticamente toda a
    Expogenética. Enquanto o acordo de cada um não for lançado, agosto mostra despesa de comissão sem a receita
    que a cobre, e o resultado do mês fica artificialmente negativo.</p>
  </div>

  <h3>Decisões que dependem da diretoria</h3>
  <table>
    <tr><th>Assunto</th><th class="num">Valor</th><th>O que precisa ser decidido</th></tr>
    <tr><td><strong>Matinha Expogenética</strong><br><span class="muted">16/08</span></td>
      <td class="num">R$ ${brl(matinha?.hp.vgv || 0)}<br><span class="muted">comissão R$ ${brl0(19200)}</span></td>
      <td>O Marcelo avisou no grupo que <em>“o José Fabio tem crédito lá, não vamos receber nada, nem Rusa”</em>.
      A venda aconteceu e conta no VGV, mas a <strong>receita é zero</strong> e a comissão precisa ser cancelada.
      Definir se cai <strong>só a parte do Rusa</strong> (${matinhaRusa.length} lotes, R$ ${brl0(matinhaRusaVgv)} → R$ ${brl0(matinhaRusaVgv * 0.05)})
      ou o fechamento inteiro.</td></tr>
    <tr><td><strong>Lote 22 do Naviraí</strong><br><span class="muted">23/08</span></td>
      <td class="num">R$ ${brl(foraDaFolha?.vgv || 0)}</td>
      <td>Está no nome de <strong>Marcelo Moura</strong>, que não é da equipe e, pela ficha do grupo, é cliente do
      Naviraí. Atribuir a um assessor ou retirar da cobertura.</td></tr>
    <tr><td><strong>Meta de agosto</strong><br><span class="muted">base de cálculo</span></td>
      <td class="num">${M.pct_agenda_divulgada.toFixed(2).replace('.', ',')}% <span class="muted">ou</span> ${M.pct_agenda_completa.toFixed(2).replace('.', ',')}%</td>
      <td>Bater ou não bater a meta depende de usar a agenda divulgada (R$ 57,29 mi) ou a completa (R$ 68,02 mi).
      <strong>Escolher antes de falar com os assessores.</strong></td></tr>
    <tr><td><strong>Comissão do Peralta</strong><br><span class="muted">pendência de julho</span></td>
      <td class="num">R$ ${brl(211500 * 0.02)}<br><span class="muted">agosto, filial ‘2’</span></td>
      <td>Segue valendo a contradição entre a decisão de 04/08 (que o tirou dos comissionados) e a regra de 26/08
      (que o trata como vendedor na filial ‘2’). Ele não recebeu comissão em 2026.</td></tr>
  </table>

  <h3>Ações de sistema — não dependem de decisão</h3>
  <ol>
    <li><strong>Gerar os ${semFechamento.length} fechamentos que faltam</strong> (R$ ${brl(semFechVgv)}), com
    <code>importa-fechamento-hastapro.mts</code>. Cinco são dos pregões de 26 e 30/08.</li>
    <li><strong>Cadastrar a Nane em PRESTADORES</strong> no HastaPro. Resolve na origem a linha em branco do painel,
    os R$ ${brl0(dv('so_no_hastapro').filter(x => /Nane/.test(x.assessor_hp)).reduce((s, x) => s + x.vgv_hp, 0))} fora
    do São Geraldo e o importador que procura “Nane” e encontra “Regiane”.</li>
    <li><strong>Refazer o 28º Naviraí Camparino</strong>: incluir os lotes 12 e 78, tirar o lote 21 e criar o
    fechamento do 6º Excelência Genética, ao qual ele pertence.</li>
    <li><strong>Resolver os ${aDefinirLote.length} “A definir” que o HastaPro já responde</strong> —
    R$ ${brl0(aDefinirLote.reduce((s, x) => s + x.vgv_hp, 0))} dos R$ ${brl0(aDefinirVgv)} sem dono no mês.
    O restante depende dos fechamentos que ainda não existem.</li>
    <li><strong>Apagar o fechamento “FÊMEAS JMP”</strong> (R$ ${brl0(41400)}): é o lote 48 do Shopping Naviraí
    de 15/08, repostado num segundo grupo e contado duas vezes. Já havia sido excluído da apuração da
    Expogenética — mas segue no ERP.</li>
    <li><strong>Lançar no HastaPro o Katispera de 17/08</strong> (R$ ${brl0(117000)}): existe no grupo e no ERP,
    e é o único fechamento de valor relevante que o HastaPro não conhece.</li>
    <li><strong>Confirmar com o assessor o lote 18 de 07/08</strong> (≈ R$ ${brl0(75000)}) — a única venda de agosto
    que não está em nenhuma outra base, com ficha sem vendedor e valor estimado pela parcela.</li>
    <li><strong>Lançar o acordo dos ${D.financeiro.fechamentos_sem_receita.length} fechamentos com receita zerada</strong>,
    para agosto parar de mostrar comissão sem a receita que a cobre.</li>
  </ol>

  <div class="box rule">
    <div class="t">Como este relatório foi feito</div>
    <p style="margin:0">VGV sempre do HastaPro (<em>LOT_TOTAL</em>, que já traz lance × parcelas × quantidade — nunca
    recalculado). Equipe e regra da pista vêm de <code>erp_folha_estrutura</code> e da mesma lista
    <code>PISTA_DA_REMATES</code> que o importador de fechamentos usa, para as duas contas nunca divergirem.
    Leilão casa com fechamento por nome, valor e data pontuados juntos; lote casa por número, nunca por valor.
    Reproduzir com <code>node scripts/apura-vendas-agosto-2026.mjs</code> e
    <code>node scripts/render-vendas-agosto-2026.mjs</code>.</p>
  </div>
  ${foot('Página 8 de 8')}
</section>
</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)

/* ═══ PDF ═════════════════════════════════════════════════════════════════ */
const desktop = path.join(os.homedir(), 'Desktop')
const pdfPath = path.join(desktop, 'Bula - Vendas de Agosto 2026 - Tres Fontes.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
await browser.close()

/* ═══ XLSX ════════════════════════════════════════════════════════════════ */
const wb = XLSX.utils.book_new()
const addSheet = (nome, linhas, cols) => {
    const ws = XLSX.utils.aoa_to_sheet(linhas)
    ws['!cols'] = cols || [{ wch: 34 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 40 }]
    XLSX.utils.book_append_sheet(wb, ws, nome)
}
addSheet('Ranking', [
    ['Assessor', 'Filial 2', 'Lotes', 'Pregao Remates', 'Total agosto', '% do mes', 'Animais'],
    ...ranking.map(a => [a.pessoa, a.hp2, a.hp2_lotes, a.hp01, a.total, r2(a.pct), a.hp2_animais + a.hp01_animais]),
    ['TOTAL', C.hp2.vgv, C.hp2.lotes, C.hp01_bula.vgv, OFICIAL, 1, TOT_ANI],
])
/* A coluna de diferença tem de bater com a coluna HastaPro ao lado dela — que
 * é FIL 2 + cobertura Remates, não só a FIL 2. */
addSheet('Tres fontes', [
    ['Assessor', 'HastaPro (FIL 2 + Remates)', 'ERP', 'WhatsApp (indic.)', 'Dif ERP - HastaPro', 'De onde vem a diferenca'],
    ...decomposicao.map(({ a, itens, dif }) => [a.pessoa, a.total, a.erp, a.wa, dif,
        Math.abs(dif) < 1 ? 'as tres fontes concordam' : itens.map(i => i.texto).join(' · ')]),
], [{ wch: 34 }, { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 74 }])
addSheet('Leilao a leilao', [
    ['Data', 'Leilao', 'Filial', 'HastaPro', 'Lotes', 'Animais', 'ERP', 'Diferenca', 'Fichas WhatsApp'],
    ...D.cruzamento.map(c => [c.data, c.leilao, c.filial, c.hp.vgv, c.hp.lotes, c.hp.animais,
        c.erp ? c.erp.vgv : null, c.dif_erp, c.wa ? c.wa.lotes : 0]),
], [{ wch: 12 }, { wch: 50 }, { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 9 }, { wch: 14 }, { wch: 13 }, { wch: 15 }])
addSheet('Lotes divergentes', [
    ['Tipo', 'Data', 'Leilao', 'Lote', 'VGV HastaPro', 'VGV ERP', 'Assessor HastaPro', 'Assessor ERP'],
    ...D.lotes_divergentes.map(x => [x.tipo, x.data, x.leilao, x.lote, x.vgv_hp ?? null, x.vgv_erp ?? null, x.assessor_hp ?? '', x.assessor_erp ?? '']),
], [{ wch: 16 }, { wch: 12 }, { wch: 46 }, { wch: 9 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 26 }])
addSheet('So no WhatsApp', [
    ['Data', 'Lote', 'Parcela', 'Animais', 'VGV indicativo', 'Assessor', 'Status', 'Ja lancado como', 'Ficha'],
    ...D.whatsapp.sem_chave_no_hastapro.map(v => [v.data, v.lote, v.parcela, v.animais, v.vgv_indicativo,
        v.assessor ?? '', v.status, v.eco_no_hastapro ? `lt ${v.eco_no_hastapro.lote} de ${v.eco_no_hastapro.leilao}` : '', v.trecho]),
], [{ wch: 12 }, { wch: 10 }, { wch: 11 }, { wch: 9 }, { wch: 15 }, { wch: 24 }, { wch: 10 }, { wch: 40 }, { wch: 70 }])
addSheet('Lotes HastaPro', [
    ['Filial', 'Data', 'Leilao', 'Lote', 'Animais', 'Lance', 'VGV', 'Pisteiro'],
    ...[...D.lotes_detalhe.hp2, ...D.lotes_detalhe.hp01_bula]
        .sort((a, b) => a.data.localeCompare(b.data) || a.leilao.localeCompare(b.leilao))
        .map(l => [l.filial, l.data, l.leilao, l.lote, l.qtd, l.lance, l.vgv, l.pisteiro ?? '']),
], [{ wch: 8 }, { wch: 12 }, { wch: 48 }, { wch: 9 }, { wch: 9 }, { wch: 12 }, { wch: 14 }, { wch: 32 }])
addSheet('Financeiro', [
    ['Comissao comprometida aos assessores', D.financeiro.comissao_assessores],
    ['Receita Bula reconhecida', D.financeiro.receita_bula],
    ['Comissao em fechamentos com receita ZERO', D.financeiro.comissao_sem_receita],
    [],
    ['Data', 'Leilao', 'VGV', 'Comissao', 'Receita'],
    ...D.financeiro.fechamentos_sem_receita.map(f => [f.data, f.nome, f.vgv, f.comissao, 0]),
], [{ wch: 40 }, { wch: 46 }, { wch: 14 }, { wch: 13 }, { wch: 12 }])
const xlsxPath = path.join(desktop, 'Bula - Vendas de Agosto 2026 - Tres Fontes.xlsx')
XLSX.writeFile(wb, xlsxPath)

console.log('HTML →', path.join(OUT, 'relatorio.html'))
console.log('PDF  →', pdfPath)
console.log('XLSX →', xlsxPath)
