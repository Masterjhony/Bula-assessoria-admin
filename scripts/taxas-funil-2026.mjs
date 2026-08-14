/**
 * AS TAXAS DE CONVERSÃO DO FUNIL 2026 — a leitura correta da meta.
 *
 *   node scripts/taxas-funil-2026.mjs
 *
 * A diretoria esclareceu (14/08) o que a tabela "META FUNIL DE VENDAS MENSAL"
 * realmente define: **a meta é a COLUNA DE PERCENTUAL**. Os números do meio
 * (650.000 impressões, 702 leads, 56,16 cadastros…) são a aritmética daquelas
 * taxas aplicadas a R$ 6.500 — tanto que vêm com casa decimal: ninguém aprova
 * "33,696 cadastros".
 *
 * Logo, medir desempenho comparando VOLUME (702 leads/mês × o que fizemos) é
 * comparação errada: depende de quanto se investiu e de quantos meses rodaram.
 * A comparação certa é TAXA contra TAXA, degrau a degrau — ela é independente
 * de escala e responde a pergunta que interessa: em qual degrau o funil perde?
 *
 * Este script calcula cada taxa com o dado real e diz quanto da meta ela cumpre.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Identidades } from './lib/base-clientes-2026.mjs'
import { APROVADOS_GRUPO, APROVADOS_LISTA } from './lib/cadastros-aprovados-grupos.mjs'
import { META_LIVE } from './lib/midia-2026.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const f = JSON.parse(fs.readFileSync(path.join(DIR, 'funil-2026.json'), 'utf8'))
const atr = JSON.parse(fs.readFileSync(path.join(DIR, 'atribuicao-campanha-2026.json'), 'utf8'))

/** A meta, como ela é de fato: taxa de conversão de um degrau para o outro. */
const META = {
    ctr: 1.20,          // impressões → cliques
    acessos: 75,        // cliques → acessos (visita que carrega)
    leads: 12,          // acessos → leads
    mql: 20,            // leads → qualificados
    cadastros: 40,      // qualificados → cadastros submetidos
    aprovados: 60,      // submetidos → aprovados
    compraram: 40,      // aprovados → clientes que compraram
}

/* ── numeradores e denominadores reais ────────────────────────────────────── */

const MESES = ['2026-06', '2026-07', '2026-08']
let impressoes = 0, cliques = 0, acessos = 0
for (const c of META_LIVE.campanhasFunil) {
    for (const [m, v] of Object.entries(c.mensal)) {
        if (!MESES.includes(m)) continue
        impressoes += v.impressoes ?? 0; cliques += v.cliques ?? 0
    }
    // landing page view só existe nas campanhas que mandam para página própria
    acessos += Number(String(c.total.landingPageView ?? 0)) || 0
}
// os LPV vieram no dump por campanha/mês; somados à parte porque nem toda campanha tem
const LPV_CONHECIDO = 275 + 1114 + 435 + 723 + 89 + 75 + 79 + 75 + 172 + 10
// ESCOPO COMPARÁVEL: 4 campanhas do funil têm o formulário na conta da leiloeira
// (Corte Perpétuo x2, Corte Tupã) ou não veicularam — o lead delas NUNCA chega à
// nossa planilha. Incluir os cliques delas no denominador, e não incluir os leads
// no numerador, produz uma taxa artificialmente baixa e um CPL inflado. Por isso
// o funil de captação da Bula é medido só sobre as campanhas cujo lead chega aqui.
const SEM_PLANILHA = ['CORTE PERPÉTUO', 'CORTE PERPÉTUO / 13 de Julho', 'CORTE TUPÃ', 'LEADS - FORMS INST EAO']
let cliquesFora = 0, investidoFora = 0, leadsMetaFora = 0
for (const c of META_LIVE.campanhasFunil) {
    if (!SEM_PLANILHA.includes(c.nome)) continue
    cliquesFora += c.total.cliques; investidoFora += c.total.investido; leadsMetaFora += c.total.leadsMeta ?? 0
}
const cliquesComparaveis = cliques - cliquesFora
const leads = f.leads.deCampanha
const mql = f.leads.mqlDeCampanha
const cadastros = f.cadastros.sistema.pessoasDeCampanha
const aprovados = f.cadastros.manual.aprovadosDeCampanha

/* quantos dos clientes atribuíveis passaram pelo cadastro aprovado */
const clientes = [...atr.comprovados, ...atr.aRevisar]
const idxAprov = new Identidades()
for (const a of [...APROVADOS_GRUPO, ...APROVADOS_LISTA]) idxAprov.add(a, { doc: a.cpf, fone: a.fone, nome: a.cliente })
const clientesQueEramAprovados = clientes.filter(c => idxAprov.busca({ doc: c.cpf, nome: c.nome }) || idxAprov.busca({ nome: c.nomeLead }))

/* ── tabela ───────────────────────────────────────────────────────────────── */

const pct = (a, b) => b ? (a * 100 / b) : null
const linha = (etapa, real, meta, num, den, obs) => ({ etapa, real, meta, num, den, cumpre: real == null ? null : real / meta, obs })

const TAXAS = [
    linha('Impressões → cliques (CTR)', pct(cliques, impressoes), META.ctr, cliques, impressoes,
        'Meta API. O criativo entrega acima do planejado.'),
    linha('Cliques → acessos', null, META.acessos, LPV_CONHECIDO, cliques,
        'NÃO MEDÍVEL: só as campanhas de landing têm page view instrumentado; as de formulário não têm site. Os ' + LPV_CONHECIDO + ' registrados cobrem parte do tráfego.'),
    linha('Acessos → leads', null, META.leads, leads, null,
        'Sem o denominador de acessos, esta taxa não se calcula. O que dá para medir é leads ÷ cliques (abaixo).'),
    linha('Cliques → leads (composta)', pct(leads, cliquesComparaveis), META.acessos * META.leads / 100, leads, cliquesComparaveis,
        'Junta os dois degraus acima: na meta, 75% × 12% = 9,0% dos cliques viram lead. Denominador exclui ' + cliquesFora + ' cliques das campanhas cujo formulário fica na conta da leiloeira (Corte Perpétuo/Tupã) e cujo lead não chega à planilha.'),
    linha('Leads → qualificados (MQL)', pct(mql, leads), META.mql, mql, leads,
        'Regra do sistema: ≥100 cabeças + Inscrição Estadual.'),
    linha('MQL → cadastros submetidos', pct(cadastros, mql), META.cadastros, cadastros, mql,
        'PISO: o registro de cadastros parou em 08/07; envio manual posterior não deixou rastro.'),
    linha('Cadastros → aprovados', pct(aprovados, cadastros), META.aprovados, aprovados, cadastros,
        'Apuração dos grupos, só os de origem campanha.'),
    linha('Aprovados → compraram', pct(clientesQueEramAprovados.length, aprovados), META.compraram, clientesQueEramAprovados.length, aprovados,
        'Clientes atribuíveis que também constam como aprovados. Outros ' + (clientes.length - clientesQueEramAprovados.length) + ' compraram sem passar pelo cadastro registrado.'),
]

console.log('AS TAXAS DO FUNIL — real × meta (a meta é a taxa, não o volume)\n')
console.log('ETAPA'.padEnd(34) + 'REAL'.padStart(9) + 'META'.padStart(8) + '  CUMPRE'.padStart(10) + '   NUMERADOR / DENOMINADOR')
console.log('─'.repeat(112))
for (const t of TAXAS) {
    const real = t.real == null ? 'n/d' : t.real.toFixed(2).replace('.', ',') + '%'
    const meta = t.meta.toFixed(t.meta < 10 ? 2 : 0).replace('.', ',') + '%'
    const cumpre = t.cumpre == null ? '—' : (t.cumpre * 100).toFixed(0) + '%'
    const frac = t.den ? `${t.num} / ${t.den}` : `${t.num} / —`
    console.log(`${t.etapa.padEnd(34)}${real.padStart(9)}${meta.padStart(8)}${cumpre.padStart(10)}   ${frac}`)
}

// conversão ponta a ponta
const pontaMeta = (META.ctr / 100) * (META.acessos / 100) * (META.leads / 100) * (META.mql / 100) * (META.cadastros / 100) * (META.aprovados / 100) * (META.compraram / 100)
const pontaReal = (cliques / impressoes) * (leads / cliquesComparaveis) * (mql / leads) * (cadastros / mql) * (aprovados / cadastros) * (clientesQueEramAprovados.length / aprovados)
console.log(`\nPONTA A PONTA (impressão → cliente que comprou)`)
console.log(`  meta: ${(pontaMeta * 100).toFixed(5)}%  →  1 cliente a cada ${Math.round(1 / pontaMeta).toLocaleString('pt-BR')} impressões`)
console.log(`  real: ${(pontaReal * 100).toFixed(5)}%  →  1 cliente a cada ${Math.round(1 / pontaReal).toLocaleString('pt-BR')} impressões`)
console.log(`  cumpre ${(pontaReal / pontaMeta * 100).toFixed(0)}% da meta`)

fs.writeFileSync(path.join(DIR, 'taxas-funil-2026.json'), JSON.stringify({
    geradoEm: new Date().toISOString().slice(0, 10),
    regra: 'A meta do funil é a TAXA de conversão de cada degrau (coluna de percentual). Os volumes da planilha da diretoria são a aritmética dessas taxas sobre R$ 6.500 e não são alvo em si.',
    base: { impressoes, cliques, cliquesComparaveis, cliquesFora, investidoFora, leadsMetaFora, lpvConhecido: LPV_CONHECIDO, leads, mql, cadastros, aprovados, clientes: clientes.length, clientesQueEramAprovados: clientesQueEramAprovados.length },
    taxas: TAXAS, pontaAPonta: { meta: pontaMeta, real: pontaReal, cumpre: pontaReal / pontaMeta },
}, null, 1))
console.log('\ngravado em outputs/base-clientes-2026/taxas-funil-2026.json')
