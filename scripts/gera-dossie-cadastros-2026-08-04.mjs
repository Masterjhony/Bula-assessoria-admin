// DOSSIÊ DE CADASTROS APROVADOS — material de submissão para uma nova leiloeira.
//
// Gera três entregáveis em outputs/dossie-cadastros-2026-08-04/:
//   • Dossie-Cadastros-Aprovados-2026-08-04.pdf — uma ficha por cliente, com
//     identificação, I.E., propriedade, crédito, documentos em mão e pendências;
//   • Submissao-Cadastros-2026-08-04.xlsx — a mesma carteira em uma linha por
//     cliente, no formato que a leiloeira consegue importar;
//   • documentos/<Cliente>/ — os arquivos originais dos grupos, separados por
//     cliente, prontos para anexar.
//
// Uso: node scripts/gera-dossie-cadastros-2026-08-04.mjs

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'
import { APROVADOS, APROVADOS_LISTA, NAO_SUBMETER, esc } from './lib/dossie-cadastros-2026-08-04.mjs'

const RAIZ = 'outputs/dossie-cadastros-2026-08-04'
const HOJE = '4 de agosto de 2026'

/* ── 1. distribuição dos arquivos por cliente ─────────────────────────────
   O índice numérico ("(23)") citado em `docs` é o prefixo do arquivo baixado
   do grupo — assim o PDF e a pasta falam a mesma língua. */
const ARQUIVOS = existsSync(`${RAIZ}/_arquivos`) ? readdirSync(`${RAIZ}/_arquivos`).filter(f => !f.startsWith('_render')) : []
const achaArquivo = n => ARQUIVOS.find(f => f.startsWith(String(n).padStart(2, '0') + '_'))

let copiados = 0
for (const c of APROVADOS) {
    if (!c.docs?.length) continue
    const pasta = join(RAIZ, 'documentos', c.nome.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60))
    mkdirSync(pasta, { recursive: true })
    for (const d of c.docs) {
        for (const num of (d.match(/\((\d+)(?:\s*e\s*(\d+))?\)/) || []).slice(1).filter(Boolean)) {
            const f = achaArquivo(num)
            if (f) { copyFileSync(join(RAIZ, '_arquivos', f), join(pasta, f)); copiados++ }
        }
    }
}
console.log(`documentos separados por cliente: ${copiados} arquivo(s)`)

/* ── 2. planilha de submissão ─────────────────────────────────────────── */
const linhaXlsx = c => ({
    Cliente: c.nome,
    'CPF/CNPJ': c.cpf || c.cnpj || '',
    'I.E.': c.ie || '',
    Propriedade: c.propriedade || '',
    Município: c.cidade || '',
    UF: c.uf || '',
    Área: c.area || '',
    Telefone: c.fone || '',
    'E-mail': c.email || '',
    Score: c.score || '',
    'Análise de crédito': c.credito || '',
    'Decisão (origem)': c.decisao || '',
    Assessor: c.assessor || 'A DEFINIR',
    'Documentos em mão': (c.docs || []).join(' · '),
    Prontidão: { pronto: 'PRONTO', parcial: 'PARCIAL', travado: 'TRAVADO' }[c.prontidao] || '',
    Pendências: (c.pendencias || []).join(' | '),
})
const linhaLista = c => ({
    Cliente: c.nome, 'CPF/CNPJ': c.cpf || '', 'I.E.': c.ie || (c.ieAlerta ? `— (${c.ieAlerta})` : ''),
    Propriedade: '', Município: c.cidade || '', UF: c.uf || '', Área: '',
    Telefone: c.fone || '', 'E-mail': c.email || '', Score: c.score || '',
    'Análise de crédito': c.score ? `Score ${c.score} (${c.faixa})` : 'sem score consultado',
    'Decisão (origem)': 'Lista da leiloeira (e-mail)',
    Assessor: c.zona, 'Documentos em mão': '',
    Prontidão: c.cpf && c.ie ? 'PRONTO' : 'PARCIAL',
    Pendências: [c.alerta, c.responsavel !== c.zona ? `Responsável atual (${c.responsavel}) fora da zona — realocar para ${c.zona}` : null].filter(Boolean).join(' | '),
})

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...APROVADOS.map(linhaXlsx), ...APROVADOS_LISTA.map(linhaLista)]), 'Aprovados')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(NAO_SUBMETER.map(c => ({ Cliente: c.nome, CPF: c.cpf || '', Quando: c.quando, 'Por que não submeter': c.motivo }))), 'Não submeter')
XLSX.writeFile(wb, `${RAIZ}/Submissao-Cadastros-2026-08-04.xlsx`)
console.log('planilha gerada')

/* ── 3. o PDF ─────────────────────────────────────────────────────────── */
const SELO = { pronto: 'PRONTO PARA SUBMETER', parcial: 'SUBMETER COM RESSALVA', travado: 'FALTA DADO ESSENCIAL' }

/** `wide` ocupa a linha inteira da grade — usado onde o valor é texto corrido. */
const campo = (rot, val, wide) => val ? `<div class="cp${wide ? ' wide' : ''}"><span class="rot">${esc(rot)}</span><span class="val">${val}</span></div>` : ''

const ficha = (c, i) => `
<article class="ficha ${c.prontidao}">
  <header>
    <div class="n">${String(i + 1).padStart(2, '0')}</div>
    <div class="id">
      <h3>${esc(c.nome)}</h3>
      <div class="sub">${esc(c.decisao)}${c.assessor ? ` · assessor <strong>${esc(c.assessor)}</strong>` : ' · <span class="warn">assessor a definir</span>'}${c.assessorFonte ? ` <span class="micro">(${esc(c.assessorFonte)})</span>` : ''}</div>
    </div>
    <div class="selo s-${c.prontidao}">${SELO[c.prontidao]}</div>
  </header>

  <div class="grade">
    ${campo('CPF', c.cpf ? esc(c.cpf) + (c.cpfObs ? ` <span class="micro">${esc(c.cpfObs)}</span>` : '') : '<span class="falta">não temos</span>')}
    ${campo('CNPJ', c.cnpj && esc(c.cnpj))}
    ${campo('Nascimento', c.nascimento && esc(c.nascimento))}
    ${campo('Documento', c.rg && esc(c.rg))}
    ${campo('Município / UF', (c.cidade || c.uf) ? esc([c.cidade, c.uf].filter(Boolean).join(' / ')) + (c.cep ? ` <span class="micro">CEP ${esc(c.cep)}</span>` : '') : '<span class="falta">não temos</span>')}
    ${campo('Área', c.area && esc(c.area))}
    ${campo('Contato', [c.fone ? `📞 ${esc(c.fone)}` : '', c.email ? `✉ ${esc(c.email)}` : ''].filter(Boolean).join(' · ') || '<span class="falta">sem telefone e sem e-mail</span>')}
    ${campo('Filiação', c.filiacao && esc(c.filiacao), true)}
    ${campo('Inscrição Estadual', c.ie ? `<strong>${esc(c.ie)}</strong>${c.ieObs ? `<br><span class="micro">${esc(c.ieObs)}</span>` : ''}` : `<span class="falta">não temos</span>${c.ieObs ? `<br><span class="micro">${esc(c.ieObs)}</span>` : ''}`, true)}
    ${campo('Propriedade', c.propriedade && esc(c.propriedade), true)}
    ${campo('Endereço', c.endereco && esc(c.endereco), true)}
    ${campo('Crédito', `${c.score ? `<strong class="score">${c.score}</strong> · ` : ''}${esc(c.credito || '—')}`, true)}
    ${campo('Evidência da aprovação', `<span class="ev">${esc(c.evidencia)}</span>`, true)}
    ${campo('Documentos em mão', c.docs?.length
        ? c.docs.map(d => `<span class="doc">${esc(d)}</span>`).join(' ')
        : '<span class="falta">nenhum arquivo — só a decisão no grupo</span>', true)}
  </div>

  ${c.novidade ? `<div class="nota nova"><strong>Novo:</strong> ${esc(c.novidade)}</div>` : ''}
  ${c.correcao ? `<div class="nota corr"><strong>Corrige o relatório anterior:</strong> ${esc(c.correcao)}</div>` : ''}
  ${c.pendencias?.length ? `<div class="pend"><span class="rot">Antes de submeter</span><ul>${c.pendencias.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
</article>`

const cont = p => APROVADOS.filter(c => c.prontidao === p).length
const comDoc = APROVADOS.filter(c => c.docs?.length).length
const comIe = APROVADOS.filter(c => c.ie).length
const comCpf = APROVADOS.filter(c => c.cpf || c.cnpj).length

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Dossiê de cadastros aprovados — 04/08/2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 13mm 11mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #111; font-size: 9.2px; line-height: 1.45; margin: 0; padding-bottom: 9mm; }
  h1, h2, h3 { font-family: 'Oswald', 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: .02em; margin: 0; font-weight: 700; }
  h1 { font-size: 23px; line-height: 1.05; }
  h2 { font-size: 13px; margin: 20px 0 7px; padding-bottom: 3px; border-bottom: 1.5px solid #111; break-after: avoid; }
  .box, .num-cards, table { break-inside: avoid; }
  h3 { font-size: 12px; }
  .cap { border-bottom: 3px solid #111; padding-bottom: 11px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
  .cap .sub { font-size: 10px; color: #3a3a3a; margin-top: 5px; max-width: 118mm; }
  .cap .meta { font-size: 8.4px; color: #666; text-align: right; white-space: nowrap; }
  .box { border: 1px solid #111; padding: 9px 11px; margin: 8px 0; }
  .box.grey { border: none; background: #f2f2f2; }
  .num-cards { display: flex; gap: 7px; margin: 10px 0 4px; }
  .nc { flex: 1; border: 1px solid #111; padding: 7px 9px; }
  .nc .v { font-family: 'Oswald', Arial, sans-serif; font-size: 24px; line-height: 1; }
  .nc .l { font-size: 7.6px; text-transform: uppercase; letter-spacing: .05em; color: #555; margin-top: 3px; }
  .nc.gold { border-color: #C9A84C; border-width: 2px; }
  .nc.gold .v { color: #8a6f20; }

  .ficha { border: 1px solid #c9c9c9; border-left: 3px solid #111; padding: 8px 10px 9px; margin-bottom: 9px; break-inside: avoid; }
  .ficha.travado { border-left-color: #8a6f20; background: #fcfaf4; }
  .ficha header { display: flex; align-items: flex-start; gap: 9px; border-bottom: .8px solid #ddd; padding-bottom: 5px; margin-bottom: 6px; }
  .ficha .n { font-family: 'Oswald', Arial, sans-serif; font-size: 17px; color: #bbb; line-height: 1; min-width: 22px; }
  .ficha .id { flex: 1; }
  .ficha .sub { font-size: 8.4px; color: #555; margin-top: 2px; }
  .selo { font-family: 'Oswald', Arial, sans-serif; font-size: 7.6px; text-transform: uppercase; letter-spacing: .06em; padding: 3px 7px; white-space: nowrap; align-self: center; }
  .s-pronto { background: #111; color: #fff; }
  .s-parcial { background: #fff; color: #111; border: 1px solid #111; }
  .s-travado { background: #C9A84C; color: #1a1a1a; }

  .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 14px; }
  .cp { display: flex; gap: 6px; padding: 1.5px 0; align-items: baseline; }
  .cp .rot { font-size: 7.4px; text-transform: uppercase; letter-spacing: .04em; color: #777; min-width: 62px; flex-shrink: 0; }
  .cp .val { flex: 1; }
  .cp.wide { grid-column: 1 / -1; }
  .micro { font-size: 7.6px; color: #666; }
  .falta { color: #8a6f20; font-style: italic; }
  .ev { font-style: italic; color: #333; }
  .score { font-family: 'Oswald', Arial, sans-serif; font-size: 13px; }
  .doc { display: inline-block; border: .8px solid #999; padding: 1px 5px; margin: 1px 2px 1px 0; font-size: 7.8px; }
  .warn { font-weight: 700; }

  .nota { margin-top: 5px; padding: 4px 8px; font-size: 8.2px; background: #f4f4f4; border-left: 2px solid #111; }
  .nota.nova { border-left-color: #C9A84C; background: #fbf7ec; }
  .pend { margin-top: 5px; }
  .pend .rot { font-size: 7.4px; text-transform: uppercase; letter-spacing: .05em; color: #777; }
  .pend ul { margin: 2px 0 0; padding-left: 14px; }
  .pend li { margin-bottom: 1px; }

  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { background: #111; color: #fff; font-size: 8px; text-transform: uppercase; letter-spacing: .04em; text-align: left; padding: 4px 5px; font-weight: 600; }
  td { border-bottom: .6px solid #d8d8d8; padding: 4px 5px; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .nome { font-weight: 600; }
  .num { white-space: nowrap; }
  footer { position: fixed; bottom: 4mm; left: 0; right: 0; font-size: 7.4px; color: #888; display: flex; justify-content: space-between; }
</style></head><body>

<div class="cap">
  <div>
    <h1>Dossiê de cadastros aprovados</h1>
    <div class="sub">O que temos, cliente por cliente, para submeter a carteira a uma nova leiloeira — documento fiscal, propriedade, análise de crédito, arquivos em mão e o que falta.</div>
  </div>
  <div class="meta">Bula Assessoria · ${HOJE}<br>apuração de 08/07 a 02/08/2026<br>${APROVADOS.length + APROVADOS_LISTA.length} clientes aprovados</div>
</div>

<div class="box">
  <strong>Como ler.</strong> Cada ficha traz o que está <em>comprovado por documento</em> (I.E., CNH, CAP/FIC, matrícula, CAR),
  o que veio da <em>análise de crédito da leiloeira</em> (score e restrições, transcritos do grupo) e o que <em>falta</em>.
  O selo à direita resume: <strong>PRONTO PARA SUBMETER</strong> tem nome, CPF, documento fiscal e localização;
  <strong>SUBMETER COM RESSALVA</strong> submete declarando a lacuna; <strong>FALTA DADO ESSENCIAL</strong> não deve ir
  antes de resolver — mandar ficha incompleta para leiloeira nova queima a régua da assessoria inteira.
  Os arquivos citados entre parênteses estão em <code>documentos/&lt;cliente&gt;/</code>, com o mesmo número.
</div>

<div class="num-cards">
  <div class="nc"><div class="v">${APROVADOS.length + APROVADOS_LISTA.length}</div><div class="l">Aprovados no período</div></div>
  <div class="nc"><div class="v">${comCpf + APROVADOS_LISTA.filter(c => c.cpf).length}</div><div class="l">Com CPF/CNPJ</div></div>
  <div class="nc"><div class="v">${comIe + APROVADOS_LISTA.filter(c => c.ie).length}</div><div class="l">Com I.E. identificada</div></div>
  <div class="nc"><div class="v">${comDoc}</div><div class="l">Com documento em arquivo</div></div>
  <div class="nc gold"><div class="v">${cont('travado')}</div><div class="l">Travados por falta de dado</div></div>
</div>

<h2>1. Aprovados nos grupos — ficha por cliente (${APROVADOS.length})</h2>
${APROVADOS.map(ficha).join('')}

<h2>2. Aprovados pelas listas das leiloeiras (${APROVADOS_LISTA.length})</h2>
<div class="box grey">
  Vieram das relações de cadastro enviadas por e-mail e já estão no módulo CLIENTES — é a parte da carteira que se submete
  sem levantamento: CPF e I.E. registrados. Onde o responsável de hoje não é o assessor da zona, a coluna aponta a realocação.
</div>
<table>
  <thead><tr>
    <th style="width:20%">Cliente</th><th style="width:12%">CPF</th><th style="width:13%">I.E.</th>
    <th style="width:13%">Município / UF</th><th style="width:14%">Contato</th><th style="width:8%">Score</th>
    <th style="width:20%">Observação para a submissão</th>
  </tr></thead>
  <tbody>${APROVADOS_LISTA.map(c => `
    <tr>
      <td class="nome">${esc(c.nome)}</td>
      <td class="num">${esc(c.cpf || '—')}</td>
      <td class="num">${c.ie ? esc(c.ie) : `<span class="falta">${esc(c.ieAlerta || 'não temos')}</span>`}</td>
      <td>${esc([c.cidade, c.uf].filter(Boolean).join(' / '))}</td>
      <td class="micro">${esc(c.fone || '')}${c.email ? `<br>${esc(c.email)}` : ''}</td>
      <td class="num">${c.score ? `<strong>${c.score}</strong> <span class="micro">${esc(c.faixa)}</span>` : '—'}</td>
      <td>${[c.alerta ? esc(c.alerta) : '', c.responsavel !== c.zona ? `<span class="warn">Realocar:</span> hoje é do ${esc(c.responsavel)}, a zona (${esc(c.uf)}) é do <strong>${esc(c.zona)}</strong>.` : ''].filter(Boolean).join('<br>')}</td>
    </tr>`).join('')}
  </tbody>
</table>

<h2>3. Quem NÃO pode ser submetido</h2>
<div class="box grey">
  Reprovados e bloqueados na mesma janela. Entram no dossiê porque, numa leiloeira nova, mandar um nome já reprovado
  em outra praça é o jeito mais rápido de perder a régua — e dois deles têm homônimo aprovado nesta mesma lista.
</div>
<table>
  <thead><tr><th style="width:26%">Cliente</th><th style="width:12%">CPF</th><th style="width:8%">Quando</th><th style="width:54%">Motivo</th></tr></thead>
  <tbody>${NAO_SUBMETER.map(c => `
    <tr>
      <td class="nome">${esc(c.nome)}</td>
      <td class="num">${esc(c.cpf || '—')}</td>
      <td class="num">${esc(c.quando)}</td>
      <td>${esc(c.motivo)}</td>
    </tr>`).join('')}
  </tbody>
</table>

<h2>4. O caminho mais curto para submeter</h2>
<div class="box">
  <ul>
    <li><strong>Submeta hoje a lista das leiloeiras (${APROVADOS_LISTA.filter(c => c.cpf && c.ie).length} clientes com CPF e I.E.)</strong> — é a única parte da carteira que não depende de ninguém levantar nada.</li>
    <li><strong>${cont('pronto')} fichas dos grupos estão prontas</strong> — nome, CPF, I.E. comprovada e localização. Vão junto.</li>
    <li><strong>${cont('parcial')} vão com ressalva declarada.</strong> O padrão da lacuna é sempre o mesmo: <em>telefone e e-mail</em>. Os documentos vieram por dentro do grupo, o contato do cliente não — pedir aos assessores fecha quase toda a lista de uma vez.</li>
    <li><strong>${cont('travado')} não devem ir agora.</strong> Faltam CPF, I.E. ou até a identificação do cliente (dois casos são "a ficha citada", que o WhatsApp não guardou).</li>
    <li><strong>Três reemissões pendentes:</strong> a I.E. do Valdy Junior está vencida desde 2009, a do Marcus André foi emitida em 2019 e a do Carlos Augusto não sai no SINTEGRA (bloqueio do MA — pedir direto na SEFAZ).</li>
    <li><strong>Dois pares de homônimos</strong> podem trocar aprovado por reprovado na hora de digitar: Hênio Suassuna Ferreira (aprovado) × Hênio Pablo Farias Silva (reprovado); Hélio Gomes Silva (aprovado) × Hélio Mascarenhas Rocha (reprovado).</li>
  </ul>
</div>

<footer><span>Bula Assessoria — dossiê de cadastros aprovados · 08/07 a 02/08/2026</span><span>Uso interno · contém dados pessoais</span></footer>
</body></html>`

writeFileSync(`${RAIZ}/Dossie-Cadastros-Aprovados-2026-08-04.html`, html)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: `${RAIZ}/Dossie-Cadastros-Aprovados-2026-08-04.pdf`, format: 'A4', printBackground: true })
await browser.close()
console.log('PDF gerado em', RAIZ)
