/**
 * CRUZAMENTO COM O AGRISK — os aprovados que estão nos grupos e fora da planilha.
 *
 *   node scripts/gera-cruzamento-agrisk-2026-09.mjs [pasta-de-saida]
 *
 * Pedido do chefe em 08/09/2026, em cima da seção 4.1 da varredura:
 * "Consegue gerar uma planilha com os dados que conseguir aí? Faz um cruzamento
 * com AgRisk. Para pegar todos os dados deles".
 *
 * COMO OS DADOS FORAM OBTIDOS: navegando o agrisk.app já logado, cliente a
 * cliente (`/clientes?search=<CPF>` → ficha `/cliente/<id>/cadastro/`), lendo
 * as abas Endereços, Telefones e Emails. NENHUMA consulta nova foi disparada —
 * consulta nova é paga, e o que está aqui é só o que o AgRisk já tinha. Por
 * isso a coluna Score vem vazia: o AgRisk só mostra score depois de uma
 * "consulta completa", que custa token.
 *
 * A data em "Consulta AgRisk" é o campo *Última Atualização* da ficha — é a
 * prova de que aquele CPF foi efetivamente consultado, e quando.
 *
 * Dados: outputs/varredura-cadastros-2026-09/agrisk.json (40 fichas lidas)
 *        scripts/lib/varredura-cadastros-2026-09.mjs (as fichas dos grupos)
 */
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { FICHAS, SO_NA_PLANILHA } from './lib/varredura-cadastros-2026-09.mjs'
import { novoWorkbook, novaAba, cabecalho, bloco, tabela, caixa, impressao } from './lib/xlsx-brand.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = process.argv[2] || path.join(homedir(), 'Desktop', 'Varredura Cadastros x Planilha (08-09-2026)')
fs.mkdirSync(SAIDA, { recursive: true })

const AGRISK = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', 'varredura-cadastros-2026-09', 'agrisk.json'), 'utf8'))
const dig = s => String(s || '').replace(/\D/g, '')
const porDoc = new Map(AGRISK.map(a => [dig(a.doc), a]))

/** Onde o grupo não tinha o CPF, o AgRisk foi achado pelo nome — a ponte fica declarada aqui. */
const PONTE = {
    'Valdy Junior Correia Evangelista': '982.832.861-53',
    'João Carlos Viana Bregantini': '001.274.381-06',
}

const APROVADO = v => v === 'aprovado' || v === 'ressalva'
const dataBr = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || '') }
const GRP = { Remates: 'Bula Remates', Programa: 'Programa Leilões' }
const grupoTxt = g => String(g).split('+').map(x => GRP[x] || x).join(' + ')
const VER = { aprovado: 'Aprovado', ressalva: 'Aprovado c/ ressalva' }

/* ── os 46 aprovados que estão fora da planilha ───────────────────────────── */
const vistos = new Set(); const aprovados = []
for (const f of FICHAS) {
    if (f.planilha) continue
    const k = dig(f.cpf || f.cnpj) || f.nome.toLowerCase()
    if (vistos.has(k)) continue
    vistos.add(k)
    if (APROVADO(f.veredito)) aprovados.push(f)
}

const linhas = aprovados.map(f => {
    const doc = dig(f.cpf || f.cnpj) || dig(PONTE[f.nome])
    const a = porDoc.get(doc)
    return {
        data: dataBr(f.data), nomeGrupo: f.nome, docGrupo: f.cpf || f.cnpj || (PONTE[f.nome] ? PONTE[f.nome] + ' (achado pelo nome)' : ''),
        grupo: grupoTxt(f.grupo), quem: f.quem || '', veredito: VER[f.veredito], leilao: f.leilao || '',
        agrisk: a ? 'SIM' : 'NÃO',
        nomeAg: a?.nome || '', docAg: a?.doc || '', consulta: a?.consulta || '',
        nasc: a?.nasc || '', idade: a?.idade || '', sexo: a?.sexo || '',
        receita: a?.receita || '', obito: a?.obito || '', cidades: a?.cidades || '',
        tel: a?.tel || '', mail: a?.mail || '',
        __cor: a ? 'verde' : 'vermelho',
    }
})
const comAg = linhas.filter(l => l.agrisk === 'SIM')
const semAg = linhas.filter(l => l.agrisk === 'NÃO')

/* ── bônus: as linhas que só existiam na planilha, testadas no AgRisk ─────── */
const BONUS_DOC = {
    2: '007.073.156-03', 3: '946.435.802-59', 4: '094.062.366-80', 5: '111.359.096-36', 8: '097.515.046-17',
    11: '013.447.456-28', 32: '799.386.396-15', 33: '818.910.911-15', 34: '505.197.351-53', 36: '122.015.147-55',
    42: '225.953.838-09', 47: '009.697.271-86', 53: '994.891.206-34', 56: '144.237.038-66', 57: '084.027.246-47',
    58: '836.098.651-72', 10: '604.426.573-07', 30: '001.908.197-90', 44: '040.007.556-33',
}
const bonus = SO_NA_PLANILHA.map(r => {
    const doc = BONUS_DOC[r.linha] || r.cpf
    const a = porDoc.get(dig(doc))
    return {
        linha: r.linha, nome: r.nome, doc: doc || '—', uf: r.uf || '', marcado: r.marcado,
        agrisk: a ? 'SIM' : 'NÃO', nomeAg: a?.nome || '', consulta: a?.consulta || '',
        cidades: a?.cidades || '', tel: a?.tel || '', mail: a?.mail || '',
        leitura: a
            ? `Foi consultada no AgRisk em ${a.consulta} — o cadastro existiu, só não passou pelos grupos.`
            : 'Não existe no AgRisk: este CPF nunca foi consultado por lá.',
        __cor: a ? 'verde' : 'vermelho',
    }
})
const bonusSim = bonus.filter(b => b.agrisk === 'SIM').length

/* ── lista limpa para o comercial ─────────────────────────────────────────── */
const celular = t => (String(t).split(' · ').find(x => /\(\d\d\)\s?9\d{4}/.test(x)) || String(t).split(' · ')[0] || '').trim()
const email1 = m => (String(m).split(' · ')[0] || '').trim()
const contatos = comAg.map(l => ({
    nome: l.nomeAg, doc: l.docAg,
    cidade: (l.cidades.split(' / ')[0] || '').replace(/\/[A-Z]{2}$/, ''),
    uf: ((l.cidades.match(/\/([A-Z]{2})/) || [])[1] || ''),
    cel: celular(l.tel), email: email1(l.mail), veredito: l.veredito, dataFicha: l.data, quem: l.quem,
    origem: 'ficha aprovada no grupo, fora da planilha',
}))

/* ── XLSX ─────────────────────────────────────────────────────────────────── */
const wb = novoWorkbook('Cruzamento AgRisk — aprovados fora da planilha')

{
    const ws = novaAba(wb, 'Resumo')
    let l = cabecalho(ws, 'Cruzamento com o AgRisk', 'Os aprovados pela leiloeira que não estão na aba CADASTROS · apurado em 08/09/2026', 4)
    l = bloco(ws, l, 'O que foi cruzado', 4)
    l = tabela(ws, l, [
        { t: 'Situação', k: 's', w: 52 }, { t: 'Qtd.', k: 'q', w: 10, al: 'r', fmt: '#,##0' }, { t: 'O que significa', k: 'o', w: 78 },
    ], [
        { s: 'Aprovados no grupo e fora da planilha', q: linhas.length, o: 'A seção 4.1 do relatório de hoje.' },
        { s: '— achados no AgRisk (com dados completos)', q: comAg.length, o: 'Nome oficial, CPF, nascimento, cidade/UF, telefones e e-mails — prontos para o CRM.', __cor: 'verde' },
        { s: '— sem registro no AgRisk', q: semAg.length, o: 'Esse CPF nunca foi consultado por lá: o veredito veio direto do sistema da leiloeira.', __cor: 'vermelho' },
        { s: 'Linhas que só existiam na planilha', q: bonus.length, o: 'Bônus: testei as 19 uma a uma no AgRisk.' },
        { s: '— achadas no AgRisk', q: bonusSim, o: 'O cadastro existiu de verdade, só não passou pelos grupos.', __cor: 'verde' },
        { s: '— sem registro em lugar nenhum', q: bonus.length - bonusSim, o: 'Nem grupo, nem AgRisk. É marcação sem lastro.', __cor: 'vermelho' },
    ], { congela: false, filtro: false })
    l++
    l = caixa(ws, l, 'Duas coisas que este cruzamento provou', '1) O GRUPO NÃO É A ÚNICA PORTA. Onze linhas que a varredura de hoje deu como "sem rastro" estão no AgRisk com data de consulta — Wilkson (25/04), Romualdo e Dayse (21/05), Marco Aurelio (07/05), Neusivan (13/05), Pablo, Maxwell e Carlos Fernando (12/06), Dirceu (11/06), Leonardo de Oliveira (16/06) e Raphael Henrique (13/04). O cadastro delas foi feito antes de os grupos existirem, ou por fora deles.\n\n2) DOIS ANÔNIMOS GANHARAM NOME. A ficha de 30/07 sem nome (CPF 013.447.456-28) é o TRAJANO PINHEIRO — que é justamente a linha 11 da planilha, aquela marcada como cadastrada sem nenhuma prova. E a consulta anônima de 03/09 (CPF 123.782.596-20) é EURIPEDES PEREIRA ROSA, de Campinaçu/GO.\n\n⚠ NENHUMA consulta nova foi disparada no AgRisk — consulta completa é paga. Por isso não há coluna de Score aqui: o que está nesta planilha é o que o sistema já tinha guardado.', 4)
    impressao(ws, { paisagem: false })
}

{
    const ws = novaAba(wb, 'Aprovados x AgRisk')
    let l = cabecalho(ws, `Os ${linhas.length} aprovados que estão fora da planilha`, 'Verde = achado no AgRisk com dados completos · Vermelho = CPF nunca consultado por lá', 18)
    l = tabela(ws, l, [
        { t: 'Data da ficha', k: 'data', w: 12, al: 'c' }, { t: 'Nome no grupo', k: 'nomeGrupo', w: 34 },
        { t: 'CPF/CNPJ', k: 'docGrupo', w: 20 }, { t: 'Grupo', k: 'grupo', w: 22 }, { t: 'Quem levou', k: 'quem', w: 20 },
        { t: 'Veredito', k: 'veredito', w: 17 }, { t: 'Leilão', k: 'leilao', w: 18 },
        { t: 'No AgRisk?', k: 'agrisk', w: 10, al: 'c' }, { t: 'Nome no AgRisk', k: 'nomeAg', w: 34 },
        { t: 'CPF AgRisk', k: 'docAg', w: 16 }, { t: 'Consulta AgRisk', k: 'consulta', w: 13, al: 'c' },
        { t: 'Nascimento', k: 'nasc', w: 12, al: 'c' }, { t: 'Idade', k: 'idade', w: 7, al: 'c' }, { t: 'Sexo', k: 'sexo', w: 6, al: 'c' },
        { t: 'Receita Federal', k: 'receita', w: 13, al: 'c' }, { t: 'Óbito', k: 'obito', w: 9, al: 'c' },
        { t: 'Cidades (endereços)', k: 'cidades', w: 42 }, { t: 'Telefones', k: 'tel', w: 52 }, { t: 'E-mails', k: 'mail', w: 52 },
    ], linhas, { congelaCol: 2 })
    impressao(ws, { repetir: `${l}:${l}` })
}

{
    const ws = novaAba(wb, 'Contatos p-comercial')
    let l = cabecalho(ws, 'Lista limpa para o comercial', `${contatos.length} clientes aprovados pela leiloeira, com contato conferido no AgRisk — prontos para entrar no CRM`, 9)
    l = tabela(ws, l, [
        { t: 'Nome', k: 'nome', w: 38 }, { t: 'CPF', k: 'doc', w: 17 }, { t: 'Cidade', k: 'cidade', w: 26 }, { t: 'UF', k: 'uf', w: 6, al: 'c' },
        { t: 'Celular', k: 'cel', w: 18 }, { t: 'E-mail', k: 'email', w: 34 },
        { t: 'Veredito', k: 'veredito', w: 17 }, { t: 'Data da ficha', k: 'dataFicha', w: 12, al: 'c' }, { t: 'Quem levou', k: 'quem', w: 20 },
    ], contatos, { congelaCol: 1 })
    impressao(ws, { repetir: `${l}:${l}` })
}

{
    const ws = novaAba(wb, 'So na planilha x AgRisk')
    let l = cabecalho(ws, 'As 19 linhas "só na planilha", testadas no AgRisk', 'Verde = o cadastro existiu (tem consulta no AgRisk) · Vermelho = sem lastro em nenhuma das duas fontes', 11)
    l = tabela(ws, l, [
        { t: 'Linha', k: 'linha', w: 7, al: 'c' }, { t: 'Nome na planilha', k: 'nome', w: 36 }, { t: 'CPF', k: 'doc', w: 18 },
        { t: 'UF', k: 'uf', w: 8, al: 'c' }, { t: 'Marcado como cadastrado em', k: 'marcado', w: 30 },
        { t: 'No AgRisk?', k: 'agrisk', w: 10, al: 'c' }, { t: 'Nome no AgRisk', k: 'nomeAg', w: 36 },
        { t: 'Consulta AgRisk', k: 'consulta', w: 13, al: 'c' }, { t: 'Cidades', k: 'cidades', w: 40 },
        { t: 'Telefones', k: 'tel', w: 48 }, { t: 'E-mails', k: 'mail', w: 44 }, { t: 'Leitura', k: 'leitura', w: 56 },
    ], bonus, { congelaCol: 2 })
    impressao(ws, { repetir: `${l}:${l}` })
}

await wb.xlsx.writeFile(path.join(SAIDA, 'Cruzamento-AgRisk-Aprovados-2026-09-08.xlsx'))
console.log('OK →', path.join(SAIDA, 'Cruzamento-AgRisk-Aprovados-2026-09-08.xlsx'))
console.log(` · ${linhas.length} aprovados fora da planilha · ${comAg.length} achados no AgRisk · ${semAg.length} sem registro`)
console.log(` · bônus: ${bonusSim} das ${bonus.length} linhas "só na planilha" existem no AgRisk`)
