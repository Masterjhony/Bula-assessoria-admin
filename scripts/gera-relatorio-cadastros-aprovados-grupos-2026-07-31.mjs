// Relatório: CADASTROS APROVADOS nos grupos de cadastro das leiloeiras
// (Cadastros Bula Remates + Cadastros Bula e Programa), com a distribuição
// pelo critério de regionalidade (assessor-zona.ts).
//
// Fontes:
//   1. Transcrição dos dois grupos registrada pelo sistema (whatsapp_messages +
//      operational_items) — janela 08/07/2026 a 31/07/2026;
//   2. cliente_leiloeira_cadastro (decisões gravadas + lista da leiloeira);
//   3. crm_leads / clientes para UF, cidade e telefone.
//
// A leitura das aprovações é MANUAL e está declarada em APROVADOS_GRUPO abaixo:
// no grupo a decisão vem em texto livre ("Fulano - OK", "Apto", "cadastro bom"),
// muitas vezes citando a ficha, e não há parser que dê conta sem inventar.
// Cada linha carrega a frase que a sustenta para o chefe conferir.
//
// Uso: node scripts/gera-relatorio-cadastros-aprovados-grupos-2026-07-31.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

/* ── regionalidade (espelho de src/lib/assessor-zona.ts) ─────────────────── */
const UF_DO_ASSESSOR = {
    'Douglas Bispo': ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO', 'MA'],
    'Fábio Omena Gaia': ['AL', 'BA', 'CE', 'PB', 'PE', 'PI', 'RN', 'SE', 'ES', 'MG', 'RJ', 'SP'],
    'Leonardo Serafim': ['MS', 'MT', 'GO', 'DF', 'PR', 'RS', 'SC'],
}
const ASSESSOR_POR_UF = Object.fromEntries(
    Object.entries(UF_DO_ASSESSOR).flatMap(([a, ufs]) => ufs.map(uf => [uf, a])))
const assessorPorUf = uf => ASSESSOR_POR_UF[String(uf || '').toUpperCase()] || null

/* ── APROVADOS COM DECISÃO NO GRUPO ──────────────────────────────────────
   `uf` + `ufFonte`: de onde saiu a região. `assessorForcado`: quando o próprio
   grupo direcionou ("Direcionado para Leonardo Serafim") — o direcionamento
   humano vale mais que a regra, e a divergência (se houver) vira observação. */
const APROVADOS_GRUPO = [
    // ── Cadastros Bula e Programa (Programa Leilões) ──
    {
        cliente: 'Rulio Victor Pereira Oliveira', grupo: 'Programa', data: '10/07',
        evidencia: '"Rulio Victor Pereira Oliveira - Cadastro OK" (Sendy)',
        uf: 'MG', ufFonte: 'DDD 32 (lead sem UF no cadastro)', obs: 'Confirmar UF da propriedade.',
    },
    {
        cliente: 'Hélio Gomes Silva', grupo: 'Programa', data: '10/07',
        evidencia: 'Decisão gravada no sistema por Márcia Lourenço (canal WhatsApp)',
        uf: 'MG', ufFonte: 'cadastro — Almenara/MG', obs: '',
    },
    {
        cliente: 'Thomas Bianchine', grupo: 'Programa', data: '10/07',
        evidencia: 'Decisão gravada no sistema por Márcia Lourenço (canal WhatsApp)',
        uf: 'ES', ufFonte: 'cadastro do lead + DDD 28', obs: '',
    },
    {
        cliente: 'Luiz do Couro — Faz. Malhada Bonita, Pedro Alexandre/BA', grupo: 'Programa', data: '11/07',
        evidencia: '"Cadastro ok" (Márcia Lourenço), respondendo ao pedido do Marcelo',
        uf: 'BA', ufFonte: 'cidade informada na mensagem', obs: 'Identificado por apelido — levantar o nome completo e o CPF.',
    },
    {
        cliente: 'Márcio de Vasconcelos Martins', grupo: 'Programa', data: '12/07',
        evidencia: '"Marcio De Vasconcelos Martins - OK" (Sendy)',
        uf: 'RO', ufFonte: 'cadastro — Ariquemes/RO', obs: 'Já está em CLIENTES com o Douglas.',
    },
    {
        cliente: 'Edilberto Pereira Sarubi', grupo: 'Programa', data: '12/07',
        evidencia: '"Edilberto Pereira Sarubi - OK" (Sendy)',
        uf: null, ufFonte: 'sem UF na base', obs: 'Existe um "Gilberto Pereira Sarubi" em Oriximiná/PA — checar se é da mesma família antes de alocar.',
    },
    {
        cliente: 'José Luiz Antunes', grupo: 'Programa', data: '16/07',
        evidencia: 'Dados enviados 19:37 + "Ok" (Márcia Lourenço); consta aprovado na lista da leiloeira',
        uf: 'MG', ufFonte: 'cadastro — Itaúna/MG', obs: '',
    },
    {
        cliente: 'Marcelo Augusto Gomes Cataldo', grupo: 'Programa', data: '16/07',
        evidencia: 'Ficha com SERASA 779 enviada 19:50 + "Ok" (Márcia Lourenço); consta aprovado na lista',
        uf: 'MG', ufFonte: 'cadastro — Sete Lagoas/MG', obs: 'Duplicado em CLIENTES (um registro com o Leonardo, outro com o Fábio) — unificar.',
    },
    {
        cliente: 'José Aladino Barbosa dos Santos', grupo: 'Programa', data: '18/07',
        evidencia: '"Jose Aladino Barbosa dos Santos - ok" (Juliane Safra)',
        uf: null, ufFonte: 'não está na base', obs: 'Já é cliente Guadalupe — puxar a UF de lá.',
    },
    {
        cliente: 'João Carlos Viana Bregantini', grupo: 'Programa', data: '19/07',
        evidencia: '"João Carlos Viana Bregantini - ok" (Juliane Safra)',
        uf: null, ufFonte: 'não está na base', obs: 'Cadastro pedido pelo Leonardo no grupo.',
    },
    {
        cliente: 'Ejamal Muhd Shihadeh Khalil', grupo: 'Programa', data: '20/07',
        evidencia: '"Ejamal Muhd Shihadeh Khalil - ok" (Sendy)',
        uf: 'PR', ufFonte: 'Fazenda Terra Rica/PR informada no grupo', obs: 'Já está em CLIENTES com o Leonardo.',
    },
    // ── Cadastros Bula Remates ──
    {
        cliente: '2 cadastros enviados pelo Douglas (docs "Exploração Pecuária – Vicente" e "Escritura Clemencion")',
        grupo: 'Remates', data: '24/07',
        evidencia: '"Mandei para deixar salvo no grupo, ambos aprovados"',
        uf: null, ufFonte: 'sem dados na mensagem', assessorForcado: 'Douglas Bispo',
        obs: 'Nomes completos só aparecem dentro dos PDFs — o Douglas trouxe os dois.',
    },
    {
        cliente: 'Hermann', grupo: 'Remates', data: '25/07',
        evidencia: 'Score 908 · sem restrições · I.E. 12 anos · 129 ha próprios — "Apto"',
        uf: null, ufFonte: 'não informada', assessorForcado: 'Leonardo Serafim',
        obs: 'O próprio grupo direcionou: "Direcionado para assessor Leonardo Serafim".',
    },
    {
        cliente: 'Idelson', grupo: 'Remates', data: '25/07',
        evidencia: 'Score 840 · sem restrições · I.E. 3 anos · 222 ha próprios — "Apto"',
        uf: null, ufFonte: 'não informada', obs: 'No grupo foi "direcionado para Nane" (leiloeira) — falta definir o assessor Bula.',
    },
    {
        cliente: 'Sidiney', grupo: 'Remates', data: '25/07',
        evidencia: 'Score 900 · sem restrições · I.E. 15 anos · 62 ha próprios — "Apto"',
        uf: null, ufFonte: 'não informada', obs: '⚠ Logo depois: "a I.E. não é do ramo" — revisar antes de tratar como habilitado.',
    },
    {
        cliente: 'Neuza', grupo: 'Remates', data: '25/07',
        evidencia: 'Score 697 · sem protestos · I.E. 1 ano · 66 ha próprios — "Apta"',
        uf: null, ufFonte: 'não informada', obs: '',
    },
    {
        cliente: 'Cliente consultado a pedido do Douglas (sem nome no grupo)', grupo: 'Remates', data: '28/07',
        evidencia: '"cadastro bom!" → "Passei para o Serafim"',
        uf: null, ufFonte: 'não informada', assessorForcado: 'Leonardo Serafim',
        obs: 'Identificar o cliente com o Douglas.',
    },
    {
        cliente: 'Marcus André Madeira Campos Almeida — CPF 756.698.113-72 (Faz. Santa Helena)', grupo: 'Remates', data: '30/07',
        evidencia: '"opa cadastro bom" · score 890/1000',
        uf: null, ufFonte: 'não está na base', obs: 'Cadastrar: veio por e-mail e I.E. em PDF, sem telefone.',
    },
    {
        cliente: 'Cliente com 3 I.E. — CPF 013.447.456-28 (nome não citado)', grupo: 'Remates', data: '30/07',
        evidencia: '"score bom, cadastro ok!" (citando a ficha do CPF)',
        uf: null, ufFonte: 'não está na base', assessorForcado: 'Leonardo Serafim',
        obs: 'Grupo direcionou: "Show! Direcionado para Leonardo Serafim".',
    },
    {
        cliente: 'Laércio José Oliveira Almeida — CPF 465.863.346-91 · I.E. 0011334910025', grupo: 'Remates', data: '31/07',
        evidencia: '"cadastro bom, aprovado" (citando a ficha)',
        uf: null, ufFonte: 'não está na base', assessorForcado: 'Leonardo Serafim',
        obs: 'Grupo direcionou: "Direcionado para Leonardo Serafim".',
    },
]

/* ── Aprovados que o sistema conhece pela LISTA DA LEILOEIRA (canal e-mail),
      sem decisão no grupo. Entram porque também são cadastro aprovado. ── */
const APROVADOS_LISTA = [
    { cliente: 'Dirceu de Oliveira Valente', uf: 'RJ', cidade: 'Maricá', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates + Programa' },
    { cliente: 'Daniel Cunha Câmara', uf: 'GO', cidade: 'Rio Verde', atual: 'Leonardo Serafim', leiloeiras: 'Remates + Programa', obs: '⚠ Na Programa consta "Não autorizado" (14/07) — conferir qual vale.' },
    { cliente: 'Adeildo Duão de Oliveira', uf: 'MS', cidade: 'Jardim', atual: 'Leonardo Serafim', leiloeiras: 'Remates + Programa' },
    { cliente: 'Juliano Labiak', uf: 'MT', cidade: 'Nova Monte Verde', atual: 'Leonardo Serafim', leiloeiras: 'Remates + Programa' },
    { cliente: 'Amadeu Ferino de Medeiros', uf: 'RN', cidade: 'Lagoa Nova', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates + Programa' },
    { cliente: 'Marcelo Clemente Araújo', uf: 'PA', cidade: 'Novo Progresso', atual: 'João Antônio', leiloeiras: 'Remates + Programa' },
    { cliente: 'Edvaldo Lemos Fernandes Silva', uf: 'MG', cidade: 'Campos Altos', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates' },
    { cliente: 'Deiglames Oliveira Silva', uf: 'MA', cidade: 'Imperatriz', atual: 'Douglas Bispo', leiloeiras: 'Remates + Programa' },
    { cliente: 'Leonardo de Oliveira', uf: 'MG', cidade: 'Florestal', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates + Programa' },
    { cliente: 'Pedro Leão', uf: 'PB', cidade: 'Mulungu', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates' },
    { cliente: 'José Luiz Antunes', uf: 'MG', cidade: 'Itaúna', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates + Programa', obs: 'Mesmo cliente aprovado no grupo em 16/07.' },
    { cliente: 'Carlos Fernando Machado Junior', uf: 'ES', cidade: '—', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates' },
    { cliente: 'Antonio Francisco Slongo', uf: 'PR', cidade: '—', atual: 'Leonardo Serafim', leiloeiras: 'Remates + Programa' },
    { cliente: 'Octacilio Carlos Valcher', uf: 'ES', cidade: 'Viana', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates' },
    { cliente: 'Maxwell de Sousa e Silva de Carvalho', uf: 'TO', cidade: 'Palmas', atual: 'João Antônio', leiloeiras: 'Remates + Programa' },
    { cliente: 'Pablo Pinheiro Costa', uf: 'MA', cidade: 'Colinas', atual: 'Douglas Bispo', leiloeiras: 'Remates + Programa' },
    { cliente: 'Ivana S. Potenza Magão', uf: 'SP', cidade: 'Tarabai', atual: 'João Antônio', leiloeiras: 'Remates + Programa' },
    { cliente: 'Marcelo Oliveira', uf: 'MG', cidade: 'Divinópolis', atual: 'João Antônio', leiloeiras: 'Remates + Programa' },
    { cliente: 'Marcelo Cataldo', uf: 'MG', cidade: 'Sete Lagoas', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates + Programa', obs: 'Registro duplicado do Marcelo Augusto Gomes Cataldo (aprovado no grupo em 16/07).' },
]

/* ── Recusados / pendentes no período (para não virarem "aprovado" por engano) ── */
const NAO_APROVADOS = [
    { cliente: 'Ferdinando Francisco Ramos dos Santos', grupo: 'Programa', data: '10/07', motivo: 'Restrição no CPF, sem limite, sem vínculo com pecuária' },
    { cliente: 'Tiago Menezes Esposti', grupo: 'Programa', data: '10/07 e 18/07', motivo: 'Restrição no CPF, sem limite, sem vínculo com a pecuária' },
    { cliente: 'Elielson dos Santos Rios', grupo: 'Programa', data: '10/07 e 12/07', motivo: 'Restrição no CPF, sem propriedade rural no CPF' },
    { cliente: 'Paulo Henrique Caetano Costa', grupo: 'Programa', data: '10/07', motivo: 'Restrições no CPF, sem propriedade registrada' },
    { cliente: 'Márcia Guimarães', grupo: 'Programa', data: '12/07', motivo: 'Restrição no CPF; renda abaixo de R$ 2.000' },
    { cliente: 'Josefina Martins de Souza', grupo: 'Programa', data: '12/07', motivo: 'Não autorizado — pendente documentação' },
    { cliente: 'Francisney Dutra Moreira', grupo: 'Programa', data: '12/07', motivo: 'Restrição no CPF, sem propriedade rural' },
    { cliente: 'Maria Aparecida Dantas Dias', grupo: 'Programa', data: '14/07', motivo: 'Sem limite, renda baixa, sem propriedade rural' },
    { cliente: 'Marusan Mendes de Souza', grupo: 'Programa', data: '14/07 e 20/07', motivo: 'Renda presumida abaixo de R$ 1.000 — não autorizado' },
    { cliente: 'Daniel Cunha da Camara', grupo: 'Programa', data: '14/07', motivo: 'Restrição no Serasa (⚠ mas consta aprovado na lista das duas leiloeiras)' },
    { cliente: 'Hênio Suassuna Ferreira', grupo: 'Programa + Remates', data: '20/07 a 21/07', motivo: 'PENDENTE — score ok, sem I.E./NIRF; faltou matrícula e foto do documento' },
    { cliente: 'José Dias Dantas (CAD-8B5ED / CAD-B559F)', grupo: 'Remates + Programa', data: '28/07', motivo: 'RECUSADO — único cadastro submetido pela automação no período' },
    { cliente: 'Denis Igor Silva Santos', grupo: 'Remates', data: '31/07', motivo: '23 anos e com restrição — reprovado' },
    { cliente: 'Cadastro enviado 30/07 (I.E. em PDF)', grupo: 'Remates', data: '31/07', motivo: 'Score 689, sem I.E. e processo trabalhista de R$ 500 mil — "talvez possa cilada"' },
]

const SEM_IDENTIFICACAO = [
    '09/07 08:27 — "Cadastro aprovado" (Márcia Lourenço), respondendo a uma ficha citada',
    '09/07 21:29 — "Aprovado" (Márcia Lourenço)',
    '10/07 11:27 — "aprovado" (Márcia Lourenço)',
]

/* ── consolidação ────────────────────────────────────────────────────────── */
const linhasGrupo = APROVADOS_GRUPO.map(r => {
    const porZona = assessorPorUf(r.uf)
    const assessor = r.assessorForcado || porZona
    const criterio = r.assessorForcado
        ? (porZona && porZona !== r.assessorForcado ? `direcionado no grupo (zona indicaria ${porZona})` : 'direcionado no grupo')
        : (porZona ? `regionalidade (${r.uf})` : '—')
    return { ...r, assessor, criterio }
})
// `dup`: cliente que já aparece no bloco 1 (aprovado no grupo E na lista). Fica
// nas duas tabelas — são fatos diferentes — mas conta uma vez só na distribuição.
const DUPLICADOS_BLOCO1 = ['José Luiz Antunes', 'Marcelo Cataldo']
const linhasLista = APROVADOS_LISTA.map(r => {
    const assessor = assessorPorUf(r.uf)
    return { ...r, assessor, divergente: !!assessor && r.atual !== assessor, dup: DUPLICADOS_BLOCO1.includes(r.cliente) }
})

const ASSESSORES = ['Douglas Bispo', 'Fábio Omena Gaia', 'Leonardo Serafim']
const distribuicao = ASSESSORES.map(a => ({
    assessor: a,
    zonas: a === 'Douglas Bispo' ? 'Norte + Maranhão'
        : a === 'Fábio Omena Gaia' ? 'Nordeste (exceto MA) + Sudeste' : 'Centro-Oeste + Sul',
    grupo: linhasGrupo.filter(r => r.assessor === a),
    lista: linhasLista.filter(r => r.assessor === a && !r.dup),
    repetidos: linhasLista.filter(r => r.assessor === a && r.dup).length,
}))
const semAssessor = linhasGrupo.filter(r => !r.assessor)

/* ── HTML ────────────────────────────────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const HOJE = '31 de julho de 2026'

const tabelaGrupo = rows => `
<table>
  <thead><tr>
    <th style="width:24%">Cliente</th><th style="width:8%">Grupo</th><th style="width:6%">Data</th>
    <th style="width:26%">Evidência no grupo</th><th style="width:6%">UF</th>
    <th style="width:14%">Assessor</th><th style="width:16%">Observação</th>
  </tr></thead>
  <tbody>${rows.map(r => `
    <tr>
      <td class="nome">${esc(r.cliente)}</td>
      <td>${esc(r.grupo)}</td>
      <td class="num">${esc(r.data)}</td>
      <td class="ev">${esc(r.evidencia)}</td>
      <td class="num">${r.uf ? esc(r.uf) : '<span class="warn">—</span>'}</td>
      <td>${r.assessor ? `<strong>${esc(r.assessor)}</strong><br><span class="micro">${esc(r.criterio)}</span>` : '<span class="warn">A DEFINIR</span>'}</td>
      <td class="obs">${esc(r.obs || '')}${r.uf ? '' : `<span class="micro"> ${esc(r.ufFonte)}</span>`}</td>
    </tr>`).join('')}
  </tbody>
</table>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Cadastros aprovados nos grupos — 31/07/2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #111; font-size: 9.4px; line-height: 1.45; margin: 0; padding-bottom: 8mm; }
  h1, h2, h3 { font-family: 'Oswald', 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: .02em; margin: 0; font-weight: 700; }
  h1 { font-size: 21px; line-height: 1.1; }
  h2 { font-size: 13px; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #111; }
  h3 { font-size: 11px; margin: 12px 0 4px; }
  .cap { border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
  .cap .sub { font-size: 10px; color: #444; margin-top: 4px; }
  .cap .meta { font-size: 9px; color: #666; margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { background: #111; color: #fff; font-size: 8.4px; text-transform: uppercase; letter-spacing: .04em; text-align: left; padding: 5px 6px; font-weight: 600; }
  td { border-bottom: .6px solid #d5d5d5; padding: 5px 6px; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .nome { font-weight: 600; }
  .num { white-space: nowrap; }
  .ev { color: #333; font-style: italic; }
  .obs { color: #444; }
  .micro { font-size: 8px; color: #777; }
  .warn { font-weight: 700; }
  .box { border: 1px solid #111; padding: 9px 11px; margin: 8px 0 4px; }
  .box.grey { border: none; background: #f2f2f2; }
  ul { margin: 4px 0 0; padding-left: 15px; }
  li { margin-bottom: 2px; }
  .cards { display: flex; gap: 8px; margin-top: 6px; }
  .card { flex: 1; border: 1px solid #111; padding: 8px 10px; }
  .card .t { font-family: 'Oswald', Arial, sans-serif; text-transform: uppercase; font-size: 11px; font-weight: 700; }
  .card .z { font-size: 8px; color: #666; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 5px; }
  .card .n { font-size: 26px; font-family: 'Oswald', Arial, sans-serif; line-height: 1; }
  .card .n small { font-size: 9px; color: #666; font-family: 'Segoe UI', Arial, sans-serif; }
  .card ol { margin: 6px 0 0; padding-left: 14px; font-size: 8.4px; }
  .avoid { break-inside: avoid; }
  footer { position: fixed; bottom: 4mm; left: 0; right: 0; font-size: 7.6px; color: #888; display: flex; justify-content: space-between; }
</style></head><body>

<div class="cap">
  <h1>Cadastros aprovados nos grupos de cadastro</h1>
  <div class="sub">Bula Remates e Programa Leilões — apuração das conversas dos grupos, com distribuição por regionalidade</div>
  <div class="meta">Bula Assessoria · emitido em ${HOJE} · janela apurada: 08/07/2026 a 31/07/2026</div>
</div>

<div class="box">
  <strong>Como foi apurado — e o que falta.</strong>
  A leitura é das conversas dos dois grupos, mensagem por mensagem: no grupo a leiloeira responde em texto livre
  (“Fulano&nbsp;-&nbsp;OK”, “Apto”, “cadastro bom”), quase sempre citando a ficha, então cada linha abaixo vem com a frase
  que a sustenta. Cobertura: <strong>Cadastros Bula e Programa</strong> foi criado em 07/07/2026 e está apurado de ponta a ponta;
  <strong>Cadastros Bula Remates</strong> foi criado em 10/06/2026, mas o sistema só registra esse grupo a partir de 08/07 —
  <strong>o período de 10/06 a 07/07 não existe nem no servidor nem no WhatsApp Web</strong> (o navegador só carrega os últimos dias),
  ele está apenas nos celulares. Se houve aprovação nesse mês, ela não está aqui.
</div>

<h2>1. Aprovados com decisão registrada no grupo (${linhasGrupo.length} lançamentos — 21 cadastros, um deles com dois clientes)</h2>
${tabelaGrupo(linhasGrupo)}

<h2>2. Distribuição por regionalidade</h2>
<div class="cards">
  ${distribuicao.map(d => `
  <div class="card avoid">
    <div class="t">${esc(d.assessor)}</div>
    <div class="z">${esc(d.zonas)}</div>
    <div class="n">${d.grupo.length + d.lista.length} <small>clientes (${d.grupo.length} do grupo + ${d.lista.length} da lista${d.repetidos ? `; ${d.repetidos} aparecem nas duas e contam uma vez` : ''})</small></div>
    <ol>${[...d.grupo.map(r => r.cliente), ...d.lista.map(r => r.cliente)].map(c => `<li>${esc(c)}</li>`).join('')}</ol>
  </div>`).join('')}
</div>
<div class="box grey avoid" style="margin-top:10px">
  <strong>${semAssessor.length} cadastros aprovados sem assessor definido</strong> — nenhuma UF foi informada no grupo e o cliente não está na base:
  <ul>${semAssessor.map(r => `<li>${esc(r.cliente)} <span class="micro">(${esc(r.grupo)}, ${esc(r.data)})</span></li>`).join('')}</ul>
  Sem a UF da propriedade a regra de zona não decide — e chutar pelo DDD é como o cliente vai parar no assessor errado.
</div>

<h2>3. Aprovados que o sistema conhece pela lista da leiloeira (${linhasLista.length})</h2>
<div class="box grey">
  Estes vieram das relações de cadastro das leiloeiras (canal e-mail), não de uma decisão no grupo. Entram no relatório porque
  também são cadastro aprovado — e porque em ${linhasLista.filter(r => r.divergente).length} deles o responsável de hoje não é o assessor da zona.
</div>
<table>
  <thead><tr>
    <th style="width:28%">Cliente</th><th style="width:6%">UF</th><th style="width:14%">Cidade</th>
    <th style="width:14%">Leiloeiras</th><th style="width:15%">Responsável hoje</th><th style="width:15%">Assessor por zona</th><th style="width:8%">Situação</th>
  </tr></thead>
  <tbody>${linhasLista.map(r => `
    <tr>
      <td class="nome">${esc(r.cliente)}${r.obs ? `<br><span class="micro">${esc(r.obs)}</span>` : ''}</td>
      <td class="num">${esc(r.uf)}</td><td>${esc(r.cidade)}</td><td>${esc(r.leiloeiras)}</td>
      <td>${esc(r.atual)}</td><td><strong>${esc(r.assessor)}</strong></td>
      <td>${r.divergente ? '<span class="warn">REALOCAR</span>' : 'ok'}</td>
    </tr>`).join('')}
  </tbody>
</table>

<h2>4. Aprovações que não dá para atribuir a ninguém</h2>
<div class="box grey">
  Três decisões positivas no grupo da Programa responderam a uma ficha citada, sem nome no texto — e a citação não foi guardada.
  Só é possível recuperar abrindo a conversa no celular:
  <ul>${SEM_IDENTIFICACAO.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
</div>

<h2>5. Não aprovados e pendentes no período (${NAO_APROVADOS.length})</h2>
<table>
  <thead><tr><th style="width:34%">Cliente</th><th style="width:16%">Grupo</th><th style="width:12%">Data</th><th style="width:38%">Motivo</th></tr></thead>
  <tbody>${NAO_APROVADOS.map(r => `
    <tr><td class="nome">${esc(r.cliente)}</td><td>${esc(r.grupo)}</td><td class="num">${esc(r.data)}</td><td class="obs">${esc(r.motivo)}</td></tr>`).join('')}
  </tbody>
</table>

<h2>6. O que fazer com isto</h2>
<div class="box">
  <ul>
    <li><strong>${semAssessor.length} aprovados sem UF</strong> — pedir a cidade/UF da propriedade a quem levou o cliente (Douglas e Marcelo, na maioria) e só então alocar.</li>
    <li><strong>${linhasLista.filter(r => r.divergente).length} clientes com responsável fora da zona</strong> — realocar em CLIENTES conforme a coluna “assessor por zona”.</li>
    <li><strong>Marcelo Cataldo está duplicado</strong> em CLIENTES, com dois responsáveis diferentes — unificar no Fábio (MG).</li>
    <li><strong>Daniel Cunha Câmara</strong> aparece reprovado na Programa (14/07) e aprovado nas listas das duas leiloeiras — confirmar qual vale antes de trabalhar o cliente.</li>
    <li><strong>Junho da Bula Remates (10/06 a 07/07)</strong> — se precisar dessa janela, exportar a conversa pelo celular; nenhum sistema tem esse trecho.</li>
    <li><strong>Nada disso vira registro sozinho:</strong> no período, só um cadastro (José Dias Dantas) passou pela ficha automática — todo o resto é conversa solta no grupo, que o sistema não consegue casar com cliente nenhum.</li>
  </ul>
</div>

<footer><span>Bula Assessoria — cadastros aprovados nos grupos · 08/07 a 31/07/2026</span><span>Uso interno</span></footer>
</body></html>`

/* ── saída ───────────────────────────────────────────────────────────────── */
const desktop = join(homedir(), 'Desktop')
const base = 'Cadastros-Aprovados-Grupos-2026-07-31'
writeFileSync(join(desktop, base + '.html'), html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({
    path: join(desktop, base + '.pdf'),
    format: 'A4', printBackground: true, landscape: true,
    margin: { top: '10mm', bottom: '12mm', left: '9mm', right: '9mm' },
})
await browser.close()

// conferência rápida no terminal
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const { rows: chk } = await db.query(`select status, count(*) n from cliente_leiloeira_cadastro group by status order by n desc`)
await db.end()
console.log('PDF  → ' + join(desktop, base + '.pdf'))
console.log('HTML → ' + join(desktop, base + '.html'))
console.log('Aprovados no grupo: ' + linhasGrupo.length + ' · lista da leiloeira: ' + linhasLista.length + ' · sem assessor: ' + semAssessor.length)
for (const d of distribuicao) console.log(`  ${d.assessor}: ${d.grupo.length + d.lista.length} (grupo ${d.grupo.length} / lista ${d.lista.length})`)
console.log('cliente_leiloeira_cadastro: ' + JSON.stringify(chk))
