/**
 * FUNIL 2026 — lead → qualificado → cadastro submetido → aprovado → comprou → R$.
 *
 *   node scripts/monta-funil-2026.mjs      (exige extrai-fontes + monta-base antes)
 *
 * Cada etapa declara a fonte e o buraco que ela tem. Isso é de propósito: o
 * funil da Bula em 2026 tem duas descontinuidades grandes, e um relatório que
 * as esconda é pior do que não ter relatório.
 *
 *   1) Antes de JUNHO/2026 não existe captação registrada. A planilha de leads
 *      começa em 06/06 e o CRM em 19/06. As VENDAS existem desde janeiro — logo,
 *      todo o 1º semestre vendeu sem funil de mídia.
 *   2) Desde 08/07 as aprovações das leiloeiras deixaram de virar registro no
 *      sistema (o parser só entende a ficha "#CAD"). O que existe de 08/07 em
 *      diante é apuração manual sobre os grupos, em scripts/lib/
 *      cadastros-aprovados-grupos.mjs, com a frase que sustenta cada decisão.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Identidades, carrega, docKey, foneKey, nomeKey, semAcento } from './lib/base-clientes-2026.mjs'
import { APROVADOS_GRUPO, APROVADOS_LISTA, NAO_APROVADOS, NAO_APROVADOS_REMATES } from './lib/cadastros-aprovados-grupos.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const F = path.join(DIR, 'fontes')

const planilha = JSON.parse(fs.readFileSync(path.join(F, 'planilha-leads.json'), 'utf8'))
const pgLeads = carrega(F, 'pg-crm-leads')
const pgCadastro = carrega(F, 'pg-cadastro-leiloeira')
const pgAtend = carrega(F, 'pg-atendimento')
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base-clientes.json'), 'utf8'))

const aba = nome => { const { head, rows } = planilha[nome]; return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) }

/* ── regra de qualificação: a MESMA do app (src/lib/crm-types.ts) ─────────── */

/** Piso da faixa: "101-300" → 101, "1 a 99 cabeças" → 1, "nenhuma" → 0. */
function pisoCabecas(v) {
    if (v == null) return null
    const s = String(v).trim().toLowerCase()
    if (!s) return null
    if (s === 'nenhuma') return 0
    const m = s.match(/\d+/)
    return m ? Number(m[0]) : null
}
const temIE = (flag, numero) => String(flag ?? '').trim().toLowerCase() === 'sim' || String(numero ?? '').trim().length > 0
/** MQL = piso ≥ 100 cabeças E tem Inscrição Estadual. */
const ehMql = (cabecas, ie, ieNum) => { const p = pisoCabecas(cabecas); return p != null && p >= 100 && temIE(ie, ieNum) }

/* ── 1. leads captados ────────────────────────────────────────────────────── */

const mesDe = s => { const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}` : null }

/** Só o que veio de anúncio/landing é campanha; lista importada não é. */
function classe(origem, campanha) {
    const o = semAcento(String(origem || '')).toLowerCase()
    const c = semAcento(String(campanha || '')).toLowerCase()
    if (/lista antiga|base unificada|contatos whatsapp/.test(o)) return 'base-fria'
    if (/^meta|landing|forms inst|perpetuo|sao geraldo|jmp/.test(o)) return 'campanha'
    if (/^(ca -|leads -|leilao jmp|\d{15,})/.test(c)) return 'campanha'
    if (/instagram/.test(o)) return 'organico'
    if (/habilitacao|indicacao/.test(o)) return 'direto'
    return o ? 'outro' : 'sem-origem'
}

/**
 * LEADS GERAIS é o universo: a diretoria confirmou (14/08) que todo lead entra
 * lá e depois é distribuído por interesse para TOUROS / FEMEAS / EMBRIÕES /
 * OUTROS. Conferido: as quatro abas de trabalho são 100% subconjunto de GERAIS
 * (394, 926, 47 e 151 leads de campanha, nenhum fora). Ler as cinco abas
 * contaria a mesma pessoa até três vezes; por isso aqui se lê só GERAIS.
 */
const leads = aba('LEADS GERAIS').map(l => ({
    nome: l['Nome'], fone: l['WhatsApp'], email: l['E-mail'], uf: l['UF'], cidade: l['Cidade'],
    cabecas: l['Cabeças'], ie: l['Inscrição Estadual'], interesse: l['Interesse'],
    origem: l['Origem'], campanha: l['campaign_name'] || l['utm_campaign'], data: l['Data'],
    mes: mesDe(l['Data']),
    classe: classe(l['Origem'], l['campaign_name'] || l['utm_campaign']),
    mql: ehMql(l['Cabeças'], l['Inscrição Estadual'], null),
    fonte: 'planilha',
}))

/**
 * …mas GERAIS não é TUDO. As landings de junho e julho (JMP e EAO Baviera)
 * gravaram direto no crm_leads e nunca subiram para a planilha: são 85 pessoas
 * que existem só lá. Ignorá-las subestima o topo do funil em 5%. Entram aqui,
 * deduplicadas contra a planilha por telefone (ou nome, quando não há telefone).
 */
// Dedup em DUAS chaves: telefone E nome. Usar só a primeira que existir deixa
// passar quem está na planilha com um telefone e no CRM com outro — foi o caso
// de "Carlos Roberto Ramos Leite", que entrava duas vezes.
const fonesPlanilha = new Set(leads.map(l => foneKey(l.fone)).filter(Boolean))
const nomesPlanilha = new Set(leads.map(l => nomeKey(l.nome)).filter(Boolean))
for (const l of pgLeads) {
    if (classe(l.origem, l.campaign) !== 'campanha') continue
    const kf = foneKey(l.telefone || l.celular), kn = nomeKey(l.nome)
    if (!kf && !kn) continue
    if ((kf && fonesPlanilha.has(kf)) || (kn && nomesPlanilha.has(kn))) continue
    if (kf) fonesPlanilha.add(kf)
    if (kn) nomesPlanilha.add(kn)
    const data = String(l.data_entrada || l.created_at || '').slice(0, 10)
    leads.push({
        nome: l.nome, fone: l.telefone || l.celular, email: l.email, uf: l.estado, cidade: l.cidade,
        cabecas: l.quantidade_animais, ie: l.inscricao_estadual, interesse: l.interesse,
        origem: l.origem, campanha: l.campaign, data,
        mes: data.slice(0, 7) || null,
        classe: 'campanha',
        mql: ehMql(l.quantidade_animais, l.tem_inscricao_estadual, l.inscricao_estadual),
        fonte: 'crm',
    })
}

/**
 * Lixo de formulário: leads de teste da equipe e os "dummy data" que a própria
 * Meta injeta para validar integração. São 5 e não representam pessoa nenhuma.
 */
const ehLixo = l => {
    const n = semAcento(String(l.nome ?? '')).trim()
    const d = String(l.fone ?? '').replace(/\D/g, '')
    // nome de teste, em qualquer posição, e teclado batido
    if (/test(e)?|\[teste\]|apagar|^(sdsad|asdf|qwer|aaa+|xxx+)/i.test(n)) return true
    if (/^\d{4}-\d{2}-\d{2}T/.test(n)) return true              // nome veio como timestamp
    if (/<test lead|dummy data/i.test(String(l.campanha ?? ''))) return true
    if (/importacao de validacao/i.test(semAcento(String(l.origem ?? '')))) return true
    // telefone claramente falso: 999999999, 000000000, 313131313…
    if (d && (/(\d){6,}/.test(d) || /^(\d\d){3,}/.test(d.slice(2)))) return true
    return false
}
const lixo = leads.filter(ehLixo)
const semLixo = leads.filter(l => !ehLixo(l))

/**
 * DEDUP FINAL, dentro da própria planilha. Três pessoas preencheram formulário
 * duas vezes com o mesmo telefone e grafias diferentes do nome ("Francisney
 * Dutra Moreira" e "Francisney Dutra"). Para a Meta são dois leads — ela cobra
 * por preenchimento —, mas para o funil de conversão é uma pessoa só, e é pessoa
 * que se transforma em cadastro e em cliente. Fica o registro mais antigo.
 */
const vistos = new Set()
const limpos = []
const repreenchimentos = []
for (const l of semLixo) {
    const k = foneKey(l.fone)
    if (k && vistos.has(k)) { repreenchimentos.push(l); continue }
    if (k) vistos.add(k)
    limpos.push(l)
}

const deCampanha = limpos.filter(l => l.classe === 'campanha')

/* ── 2. cadastros submetidos e aprovados ──────────────────────────────────── */

// No sistema (só julho, e só duas leiloeiras — Bula Remates e Programa Leilões).
const sistema = {
    registros: pgCadastro.length,
    pessoas: new Set(pgCadastro.map(c => c.cliente_key)).size,
    enviados: pgCadastro.filter(c => c.status === 'enviado').length,
    aprovados: pgCadastro.filter(c => c.status === 'aprovado').length,
    recusados: pgCadastro.filter(c => c.status === 'recusado').length,
    pessoasAprovadas: new Set(pgCadastro.filter(c => c.status === 'aprovado').map(c => c.cliente_key)).size,
    janela: [pgCadastro.map(c => c.created_at).sort()[0], pgCadastro.map(c => c.created_at).sort().slice(-1)[0]],
}

// Apuração manual dos grupos (08/07 → 01/08), com a frase que sustenta cada uma.
// São 51 REGISTROS, não 51 pessoas: quem foi aprovado no grupo e depois entrou
// na consolidação de 01/08 aparece duas vezes (o material já sinalizava isso em
// José Luiz Antunes e Marcelo Cataldo). Sem deduplicar, a mesma compra entrava
// duas vezes na conversão.
const registrosAprovacao = [
    ...APROVADOS_GRUPO.map(a => ({ nome: a.cliente, uf: a.uf, fone: a.fone, cpf: a.cpf, fonte: `grupo ${a.grupo}`, data: a.data })),
    ...APROVADOS_LISTA.map(a => ({ nome: a.cliente, uf: a.uf, fone: a.fone, cpf: a.cpf, fonte: 'lista consolidada', data: a.data })),
]
const idxAprovados = new Identidades()
const aprovadosManual = []
for (const r of registrosAprovacao) {
    if (idxAprovados.busca({ doc: r.cpf, fone: r.fone, nome: r.nome })) continue
    aprovadosManual.push(r)
    idxAprovados.add(r, { doc: r.cpf, fone: r.fone, nome: r.nome })
}
const recusadosManual = [...NAO_APROVADOS, ...NAO_APROVADOS_REMATES]

/* ── 2b. de onde veio cada cadastro: campanha × planilha fria × por fora ──── */
// A diretoria alertou (14/08): os grupos também recebem cadastro "por fora" —
// cliente do assessor que nunca passou por anúncio. Para medir o desempenho
// EXATO da campanha, cada aprovado (e cada pessoa do sistema) é cruzado contra
// os leads: se está entre os leads de campanha, o cadastro é mérito da mídia;
// se só está na base fria, ou não está em lugar nenhum, é trabalho do assessor.
// O universo de lead de campanha NÃO é só a planilha: os leads das landings de
// junho (JMP) vivem apenas no crm_leads ("Landing JMP — Nelore 13/14 jun").
// Sem eles, Amadeu/Maxwell/Marcelo Clemente — atribuíveis comprovados — cairiam
// como "por fora". A importação em massa (base unificada) segue fora.
//
// A busca é em CAMADAS, do índice mais limpo pro mais sujo: um índice único com
// os 16 mil nomes do CRM cria homônimo e faz a busca por nome recusar matches
// legítimos (foi o que rebaixou o Pablo Pinheiro, atribuível, a "por fora").
const idxCampanhaPlanilha = new Identidades()
for (const l of deCampanha) idxCampanhaPlanilha.add(l, { fone: l.fone, nome: l.nome })
const idxCampanhaCrm = new Identidades()
for (const l of pgLeads) {
    if (classe(l.origem, l.campaign) === 'campanha') {
        idxCampanhaCrm.add(l, { doc: l.cpf, fone: l.telefone || l.celular, nome: l.nome })
    }
}
const idxPlanilhaQualquer = new Identidades()
for (const l of limpos) idxPlanilhaQualquer.add(l, { fone: l.fone, nome: l.nome })

const origemCadastro = alvo => {
    if (idxCampanhaPlanilha.busca(alvo)) return 'campanha'
    if (idxCampanhaCrm.busca(alvo)) return 'campanha'
    if (idxPlanilhaQualquer.busca(alvo)) return 'planilha-nao-campanha'
    return 'por-fora'
}
for (const a of aprovadosManual) a.origemCadastro = origemCadastro({ doc: a.cpf, fone: a.fone, nome: a.nome })
const aprovadosDeCampanha = aprovadosManual.filter(a => a.origemCadastro === 'campanha')
const aprovadosPorFora = aprovadosManual.filter(a => a.origemCadastro === 'por-fora')

// No sistema só existe o nome normalizado (cliente_key) — cruzamento por nome,
// com a mesma regra de recusar homônimo.
const pessoasSistema = [...new Set(pgCadastro.map(c => c.cliente_key))]
const pessoasSistemaCampanha = pessoasSistema.filter(k => idxCampanhaPlanilha.busca({ nome: k }) || idxCampanhaCrm.busca({ nome: k }))

/* ── 3. quem, de tudo isso, comprou ───────────────────────────────────────── */

/** Índice dos 240 compradores de 2026, para perguntar "fulano comprou?". */
const idxCompradores = new Identidades()
for (const p of base) idxCompradores.add(p, { doc: p.cpf, fone: p.telefone, nome: p.nome })

const comprou = alvo => idxCompradores.busca({ doc: alvo.cpf, fone: alvo.fone, nome: alvo.nome })?.registro || null

const aprovadosQueCompraram = aprovadosManual.map(a => ({ ...a, cliente: comprou(a) })).filter(a => a.cliente)
const leadsCampanhaQueCompraram = deCampanha.map(l => ({ l, cliente: comprou(l) })).filter(x => x.cliente)

const dataISO = v => { const m = String(v || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : '' }

/* ── 4. atendimento (API oficial) ─────────────────────────────────────────── */

const atendimento = {
    pessoas: pgAtend.length,
    responderam: pgAtend.filter(a => a.respondeu).length,
    janela: [pgAtend.map(a => a.t).sort()[0]?.slice(0, 10), pgAtend.map(a => a.t).sort().slice(-1)[0]?.slice(0, 10)],
}

/* ── 5. saída ─────────────────────────────────────────────────────────────── */

const porMes = {}
for (const l of limpos) {
    const k = l.mes || '(sem data)'
    porMes[k] = porMes[k] || { total: 0, campanha: 0, mql: 0, mqlCampanha: 0 }
    porMes[k].total++
    if (l.classe === 'campanha') porMes[k].campanha++
    if (l.mql) porMes[k].mql++
    if (l.mql && l.classe === 'campanha') porMes[k].mqlCampanha++
}

const porCampanha = {}
for (const l of deCampanha) {
    const k = l.campanha || l.origem || '(sem campanha)'
    porCampanha[k] = porCampanha[k] || { leads: 0, mql: 0, comIe: 0 }
    porCampanha[k].leads++
    if (l.mql) porCampanha[k].mql++
    if (temIE(l.ie)) porCampanha[k].comIe++
}

const funil = {
    geradoEm: new Date().toISOString().slice(0, 10),
    leads: {
        total: limpos.length,
        porClasse: limpos.reduce((a, l) => (a[l.classe] = (a[l.classe] || 0) + 1, a), {}),
        deCampanha: deCampanha.length,
        mql: limpos.filter(l => l.mql).length,
        mqlDeCampanha: deCampanha.filter(l => l.mql).length,
        comIe: limpos.filter(l => temIE(l.ie)).length,
        porMes, porCampanha,
        primeiraData: limpos.map(l => l.data).filter(Boolean).map(dataISO).filter(Boolean).sort()[0],
        deLandingSoNoCrm: limpos.filter(l => l.fonte === 'crm').length,
        lixoDescartado: lixo.length,
        repreenchimentos: repreenchimentos.length,
        registrosBrutos: semLixo.filter(l => l.classe === 'campanha').length,
    },
    crm: {
        total: pgLeads.length,
        importados: pgLeads.filter(l => /base unificada|contatos whatsapp/i.test(l.origem || '')).length,
        mql: pgLeads.filter(l => l.is_mql).length,
    },
    cadastros: {
        sistema: { ...sistema, pessoasDeCampanha: pessoasSistemaCampanha.length },
        manual: {
            registros: registrosAprovacao.length,
            aprovados: aprovadosManual.length,
            // De onde veio cada aprovado (alerta da diretoria 14/08: os grupos
            // também recebem cadastro "por fora", que NÃO é mérito da campanha).
            aprovadosDeCampanha: aprovadosDeCampanha.length,
            aprovadosPlanilhaNaoCampanha: aprovadosManual.filter(a => a.origemCadastro === 'planilha-nao-campanha').length,
            aprovadosPorFora: aprovadosPorFora.length,
            recusados: recusadosManual.length,
        },
    },
    conversao: {
        aprovadosQueCompraram: aprovadosQueCompraram.length,
        aprovadosDeCampanhaQueCompraram: aprovadosQueCompraram.filter(a => a.origemCadastro === 'campanha').length,
        aprovadosTotal: aprovadosManual.length,
        vgvDosAprovados: Math.round(aprovadosQueCompraram.reduce((a, x) => a + x.cliente.volumeCompra, 0) * 100) / 100,
        leadsCampanhaQueCompraram: leadsCampanhaQueCompraram.length,
        atribuiveis: base.filter(p => p.atribuivelCampanha).length,
        vgvAtribuivel: Math.round(base.filter(p => p.atribuivelCampanha).reduce((a, p) => a + p.valorAposEntradaDoLead, 0) * 100) / 100,
    },
    atendimento,
    compradores: {
        total: base.length,
        vgv: Math.round(base.reduce((a, p) => a + p.volumeCompra, 0) * 100) / 100,
        recorrentes: base.filter(p => p.recorrente).length,
        comCpf: base.filter(p => p.cpf).length,
        comTelefone: base.filter(p => p.telefone).length,
        comScore: base.filter(p => p.score !== '' && p.score != null).length,
    },
    detalhe: {
        aprovadosQueCompraram: aprovadosQueCompraram.map(a => ({ nome: a.nome, uf: a.uf, fonte: a.fonte, origemCadastro: a.origemCadastro, cliente: a.cliente.nome, volume: a.cliente.volumeCompra })),
        aprovados: aprovadosManual.map(a => ({ nome: a.nome, uf: a.uf, fonte: a.fonte, origemCadastro: a.origemCadastro })),
        atribuiveis: base.filter(p => p.atribuivelCampanha).map(p => ({ nome: p.nome, campanha: p.campanha, lead: p.dataEntradaLead, primeiraCompra: p.primeiraCompra, valor: p.valorAposEntradaDoLead })),
    },
}

fs.writeFileSync(path.join(DIR, 'funil-2026.json'), JSON.stringify(funil, null, 1))

console.log('LEADS (planilha):', funil.leads.total, '| classes:', JSON.stringify(funil.leads.porClasse))
console.log('  de campanha:', funil.leads.deCampanha, '| MQL total:', funil.leads.mql, '| MQL de campanha:', funil.leads.mqlDeCampanha)
console.log('  1ª data registrada:', funil.leads.primeiraData)
console.log('CRM:', funil.crm.total, '| importados em massa:', funil.crm.importados, '| is_mql:', funil.crm.mql)
console.log('CADASTROS no sistema:', JSON.stringify(sistema))
console.log('CADASTROS apurados à mão:', registrosAprovacao.length, 'registros →', funil.cadastros.manual.aprovados, 'pessoas | recusados:', funil.cadastros.manual.recusados)
console.log('CONVERSÃO:', JSON.stringify(funil.conversao))
console.log('ATENDIMENTO:', JSON.stringify(atendimento))
console.log('COMPRADORES:', JSON.stringify(funil.compradores))
console.log('\ngravado em outputs/base-clientes-2026/funil-2026.json')
