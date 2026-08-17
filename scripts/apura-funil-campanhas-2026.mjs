/**
 * FUNIL POR CAMPANHA 2026 — um funil por campanha, cada etapa com sua fonte.
 *
 *   node scripts/apura-funil-campanhas-2026.mjs
 *   (exige scripts/extrai-fontes-2026.mjs rodado antes, e o dump
 *    outputs/funil-campanhas-2026/meta-estrutura-AAAA-MM-DD.json da Meta)
 *
 * POR QUE ESTE SCRIPT EXISTE
 * O painel de growth mostrava UM funil só, montado sobre o crm_leads. As
 * campanhas de julho e agosto (PERPETUO TOURO, SÃO GERALDO, PERPETUO FEMEAS)
 * gravam na PLANILHA e não no CRM — então o funil do painel não descrevia
 * campanha nenhuma: misturava lead de anúncio com lista fria importada e
 * media estágio de gente que nunca entrou no CRM.
 *
 * Aqui cada campanha vira um funil próprio, e cada etapa declara:
 *   valor      — o número apurado
 *   fonte      — de onde ele veio
 *   confianca  — 'medido' (a fonte cobre o período inteiro) ou
 *                'parcial' (a fonte tem buraco conhecido; está declarado)
 *
 * NADA É RATEADO. Lead sem prova de campanha não entra em campanha nenhuma —
 * aparece no bloco 'semAtribuicao'. É melhor um funil que diz "não sei" do que
 * um funil que distribui número por proporção e vira profecia.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
    OUT, F, carregaPlanilha, carregaMeta, atribuiCampanha, classeOrigem, ehLixo,
    foneKey, docKey, nomeKey, dataIso, ehMql, temIE, pisoCabecas, semAcento,
} from './lib/funil-campanhas-2026.mjs'
import { Identidades, carrega } from './lib/base-clientes-2026.mjs'
import { APROVADOS_GRUPO, APROVADOS_LISTA, NAO_APROVADOS, NAO_APROVADOS_REMATES } from './lib/cadastros-aprovados-grupos.mjs'
import { CADASTROS_AGOSTO } from './lib/cadastros-agosto-2026.mjs'
import { CONFIRMADO_PELO_ASSESSOR } from './lib/patrocinados-confirmados.mjs'

const ROOT_SRC = path.join(OUT, '..', '..', 'src', 'lib')
const meta = carregaMeta()
const abas = carregaPlanilha()
const pgLeads = carrega(F, 'pg-crm-leads')
const pgCadastro = carrega(F, 'pg-cadastro-leiloeira')
const compras = carrega(F, 'hp-compras-2026')

/* ══ 1. LEADS ═════════════════════════════════════════════════════════════
   Universo = aba LEADS GERAIS (a diretoria confirmou em 14/08 que todo lead
   entra lá e depois é distribuído para as abas de trabalho por interesse).
   Reconferido agora: as 4 abas de trabalho são 100% subconjunto de GERAIS por
   telefone — 0 leads fora. Ler as 5 abas contaria a mesma pessoa até 3 vezes. */

const registros = []
let lixo = 0
for (const r of abas['LEADS GERAIS']) {
    const base = {
        nome: r['Nome'], fone: r['WhatsApp'], email: r['E-mail'], uf: r['UF'], cidade: r['Cidade'],
        cabecas: r['Cabeças'], ie: r['Inscrição Estadual'], interesse: r['Interesse'],
        origem: r['Origem'], campanhaRotulo: r['utm_campaign'] || r['campaign_name'],
        data: dataIso(r['Data']), leadId: String(r['Lead ID'] ?? '').trim(), fonte: 'planilha/LEADS GERAIS',
    }
    if (ehLixo(base)) { lixo++; continue }
    const a = atribuiCampanha(r, meta)
    registros.push({ ...base, campanha: a.campanha, via: a.via, conflito: a.conflito, classe: classeOrigem(base.origem, base.campanhaRotulo) })
}

/* As landings de junho/julho (JMP e EAO Baviera) gravaram direto no crm_leads e
   nunca subiram para a planilha. Sem elas o topo do funil daquelas campanhas
   fica menor do que foi. Entram deduplicadas contra a planilha. */
const fonesPlanilha = new Set(registros.map(l => foneKey(l.fone)).filter(Boolean))
const nomesPlanilha = new Set(registros.map(l => nomeKey(l.nome)).filter(Boolean))
let doCrm = 0
for (const l of pgLeads) {
    const rotulo = l.campaign || ''
    if (classeOrigem(l.origem, rotulo) !== 'campanha') continue
    const kf = foneKey(l.telefone || l.celular), kn = nomeKey(l.nome)
    if (!kf && !kn) continue
    if ((kf && fonesPlanilha.has(kf)) || (kn && nomesPlanilha.has(kn))) continue
    if (kf) fonesPlanilha.add(kf)
    if (kn) nomesPlanilha.add(kn)
    const reg = { utm_campaign: rotulo, campaign_name: rotulo, utm_medium: l.medium, utm_content: l.utm_content, Origem: l.origem }
    const a = atribuiCampanha(reg, meta)
    const base = {
        nome: l.nome, fone: l.telefone || l.celular, email: l.email, uf: l.estado, cidade: l.cidade,
        cabecas: l.quantidade_animais, ie: l.tem_inscricao_estadual || l.inscricao_estadual,
        interesse: l.interesse, origem: l.origem, campanhaRotulo: rotulo,
        data: dataIso(l.data_entrada || l.created_at), leadId: '', fonte: 'crm_leads', cpf: l.cpf,
    }
    if (ehLixo(base)) { lixo++; continue }
    registros.push({ ...base, campanha: a.campanha, via: a.via, conflito: a.conflito, classe: 'campanha' })
    doCrm++
}

/* DEDUP EM PESSOA. A Meta cobra por preenchimento, então duas submissões da
   mesma pessoa são dois leads para ela — mas para o funil de conversão é uma
   pessoa só, e é pessoa que vira cadastro e cliente. Fica a entrada MAIS ANTIGA
   (é a partir dela que a campanha pode reivindicar o que veio depois).
   Chave: Lead ID (mesmo lead exportado duas vezes) → telefone → nome. */
// Registro SEM data não é "o mais antigo" — é registro sem data. As listas
// importadas ("Lista antiga de fazendas (sem data)") entram assim, e colocá-las
// na frente fazia a pessoa herdar a data vazia; com data vazia, QUALQUER compra
// do ano passava no teste "comprou depois de virar lead". Por isso os sem data
// vão para o fim da fila.
registros.sort((a, b) => (a.data ? 0 : 1) - (b.data ? 0 : 1) || String(a.data).localeCompare(String(b.data)))
const pessoas = new Map()
const repetidos = []
for (const r of registros) {
    const k = (r.leadId && `L:${r.leadId}`) || (foneKey(r.fone) && `F:${foneKey(r.fone)}`) || (nomeKey(r.nome) && `N:${nomeKey(r.nome)}`)
    if (!k) { repetidos.push({ ...r, motivo: 'sem chave' }); continue }
    const ja = pessoas.get(k)
    if (!ja) {
        pessoas.set(k, {
            ...r, toques: 1, campanhas: new Set(r.campanha ? [r.campanha] : []),
            // data do toque que veio de anúncio — é a partir dela que a campanha
            // pode reivindicar cadastro e compra
            dataCampanha: r.campanha ? r.data : '',
            jaEstavaNaBaseFria: r.classe === 'base-fria',
        })
        continue
    }
    ja.toques++
    if (r.classe === 'base-fria') ja.jaEstavaNaBaseFria = true
    if (r.campanha) {
        ja.campanhas.add(r.campanha)
        if (!ja.dataCampanha || (r.data && r.data < ja.dataCampanha)) ja.dataCampanha = r.data
    }
    // a pessoa fica com a campanha do PRIMEIRO toque de anúncio; se o primeiro
    // registro não tinha prova e um toque posterior tem, a prova preenche o vazio
    if (!ja.campanha && r.campanha) { ja.campanha = r.campanha; ja.via = r.via + ' (toque posterior)' }
    if (!ja.data && r.data) ja.data = r.data
    if (!ja.cabecas && r.cabecas) ja.cabecas = r.cabecas
    if (!temIE(ja.ie) && temIE(r.ie)) ja.ie = r.ie
    repetidos.push({ nome: r.nome, data: r.data, campanha: r.campanha })
}
const leads = [...pessoas.values()]
// A data que vale para tudo que vem DEPOIS do lead (cadastro e compra) é a do
// toque de anúncio. Lead sem data de campanha não reivindica compra nenhuma.
for (const l of leads) if (l.campanha) l.data = l.dataCampanha || l.data

/* ══ 2. ETAPA E RESPONSÁVEL (abas de trabalho) ════════════════════════════
   A aba de trabalho é onde o time move o lead: TOUROS/FEMEAS/EMBRIÕES/OUTROS
   têm as colunas "Etapa" e "Atendido por". É o único registro de trabalho
   humano sobre o lead — o CRM não tem esses leads. */

const etapaPorFone = new Map()
for (const aba of ['TOUROS', 'FEMEAS', 'EMBRIÕES', 'OUTROS']) {
    for (const r of abas[aba]) {
        const k = foneKey(r['WhatsApp'])
        if (!k) continue
        const etapa = String(r['Etapa'] ?? '').trim()
        const quem = String(r['Atendido por'] ?? '').trim()
        if (!etapa && !quem) continue
        const ja = etapaPorFone.get(k)
        // uma pessoa pode estar em duas abas; fica a etapa mais avançada
        if (!ja || peso(etapa) > peso(ja.etapa)) etapaPorFone.set(k, { etapa, quem, aba })
    }
}
function peso(e) {
    return ({
        'CADASTRO OK': 6, 'JÁ COMPROU': 7, 'CADASTRO REPROVADO': 5,
        'SEM INFORMAÇÃO PARA CADASTRO': 4, 'QUALIFICAÇÃO': 3, 'CONEXÃO': 2,
        'NÃO RESPONDEU': 1, 'NUMERO ERRADO': 1,
    })[String(e ?? '').trim()] ?? 0
}
for (const l of leads) {
    const e = etapaPorFone.get(foneKey(l.fone))
    l.etapa = e?.etapa ?? ''
    l.atendidoPor = e?.quem ?? ''
    l.abaTrabalho = e?.aba ?? ''
}

/* ══ 3. QUALIFICAÇÃO ══════════════════════════════════════════════════════
   MQL pela regra do próprio app (crm_config → mql_rule): piso ≥100 cabeças E
   Inscrição Estadual. Não é uma regra inventada aqui. */
for (const l of leads) l.mql = ehMql(l.cabecas, l.ie, null)

/* ══ 4. CADASTROS ═════════════════════════════════════════════════════════
   Três fontes, deduplicadas em pessoa, cada uma com o buraco declarado:
     A) planilha, coluna Etapa  — cobre todo o período, é o registro do time
     B) cliente_leiloeira_cadastro — só 08 a 12/07 (o parser parou de entender
        a ficha e a submissão deixou de virar registro)
     C) leitura manual dos grupos — 08/07 a 14/08, frase a frase             */

const idxLeads = new Identidades()
for (const l of leads) idxLeads.add(l, { doc: l.cpf, fone: l.fone, nome: l.nome })

const cadastros = []       // {nome, fone, cpf, status, fonte, data, lead}
const cadastrosForaDeOrdem = []
/** "12/07" → "2026-07-12"; ISO passa direto; qualquer outra coisa → null. */
const dataCadastroIso = v => {
    const s = String(v ?? '').trim()
    const br = s.match(/^(\d{2})\/(\d{2})$/)
    if (br) return `2026-${br[2]}-${br[1]}`
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}
const add = (c) => {
    const achado = idxLeads.busca({ doc: c.cpf, fone: c.fone, nome: c.nome })
    // TESTE DE SANIDADE TEMPORAL: ninguém tem cadastro submetido antes de virar
    // lead. Quando a data do cadastro é anterior à entrada do lead, o casamento
    // por nome pegou outra pessoa — foi o caso de "Júnior Martins de Souza",
    // recusado no grupo em 12/07 e só virado lead em 27/07.
    let lead = achado?.registro ?? null
    if (lead) {
        const dc = dataCadastroIso(c.data)
        if (dc && lead.data && dc < lead.data) {
            cadastrosForaDeOrdem.push({ nome: c.nome, fonte: c.fonte, dataCadastro: dc, lead: lead.nome, dataLead: lead.data })
            lead = null
        }
    }
    cadastros.push({ ...c, lead, viaMatch: lead ? achado.via : null })
}
// A) planilha
for (const l of leads) {
    if (l.etapa === 'CADASTRO OK') add({ nome: l.nome, fone: l.fone, cpf: l.cpf, status: 'aprovado', fonte: 'planilha/Etapa', data: l.data })
    else if (l.etapa === 'CADASTRO REPROVADO') add({ nome: l.nome, fone: l.fone, cpf: l.cpf, status: 'recusado', fonte: 'planilha/Etapa', data: l.data })
}
// B) sistema
for (const c of pgCadastro) {
    if (c.status !== 'aprovado' && c.status !== 'recusado' && c.status !== 'enviado') continue
    add({ nome: c.cliente_key, fone: '', cpf: '', status: c.status === 'enviado' ? 'submetido' : c.status, fonte: 'sistema/cliente_leiloeira_cadastro', data: String(c.created_at).slice(0, 10) })
}
// C) grupos
for (const a of APROVADOS_GRUPO) add({ nome: a.cliente, fone: a.fone, cpf: a.cpf, status: 'aprovado', fonte: `grupo ${a.grupo}`, data: a.data })
for (const a of APROVADOS_LISTA) add({ nome: a.cliente, fone: a.fone, cpf: a.cpf, status: 'aprovado', fonte: 'grupo/lista consolidada', data: a.data })
for (const a of [...NAO_APROVADOS, ...NAO_APROVADOS_REMATES]) add({ nome: a.cliente, fone: a.fone, cpf: a.cpf, status: 'recusado', fonte: 'grupo', data: a.data })
for (const c of CADASTROS_AGOSTO) add({ nome: c.nome, fone: '', cpf: c.cpf, status: c.status === 'pendente' ? 'submetido' : c.status, fonte: 'grupo/agosto', data: c.data })

/* Dedup de PESSOA entre as três fontes. A mesma aprovação aparece na planilha,
   no grupo e na lista consolidada — somar as fontes triplica o número. */
const idxCad = new Identidades()
const cadastrosUnicos = []
for (const c of [...cadastros].sort((a, b) => ordemStatus(a.status) - ordemStatus(b.status))) {
    const chave = c.lead ?? null
    const ja = chave
        ? cadastrosUnicos.find(x => x.lead === chave)
        : idxCad.busca({ doc: c.cpf, fone: c.fone, nome: c.nome })?.registro
    if (ja) { ja.fontes.push(c.fonte); continue }
    const novo = { ...c, fontes: [c.fonte] }
    cadastrosUnicos.push(novo)
    idxCad.add(novo, { doc: c.cpf, fone: c.fone, nome: c.nome })
}
function ordemStatus(s) { return ({ aprovado: 0, recusado: 1, submetido: 2 })[s] ?? 3 }

/* ══ 5. COMPRAS (HastaPro) ════════════════════════════════════════════
   O universo é a PESSOA, não a filial: se um lead de campanha comprou depois
   de virar lead, a compra conta — em qualquer filial. (A filial '2' é a
   cobertura Bula e serve para o VGV do ano; é outra pergunta.)

   O CRITÉRIO DE PROVA é o mesmo já validado com a diretoria em
   scripts/atribuicao-campanha-2026.mjs, e não foi afrouxado aqui:

     • CPF ou telefone conferindo → prova.
     • Nome com UF diferente → DESCARTA. "José Carlos Almeida/SP" não é
       "Laercio Jose Oliveira Almeida"; sem esta regra, nomes comuns brasileiros
       inflam a atribuição em milhões.
     • O ERP tem telefone e ele NÃO bate → REFUTADO, mesmo com nome igual.
     • Mais de dois leads diferentes disputando o mesmo comprador → REFUTADO
       (é nome comum, a identidade não está estabelecida).
     • Senão, vale confirmação do assessor, ou a cadeia completa
       lead → aprovado no grupo → cadastro no ERP posterior → compra.

   E o valor de cada lote é rateado por COP_PORCENTAGEM: lote arrematado em
   sociedade não vale inteiro para cada sócio.                                */

const compradores = new Map()
for (const c of compras) {
    const k = String(c.cli_codigo)
    const p = compradores.get(k) ?? {
        codigo: k, nome: c.cli_nome, cpf: c.cli_cpfcnpj, uf: c.cli_uf,
        fone: c.cli_celular || c.cli_fonecom1 || c.cli_foneres || '',
        dataCadastro: c.cli_datacadastro ? String(c.cli_datacadastro).slice(0, 10) : null,
        compras: [],
    }
    p.compras.push({
        data: String(c.lei_data).slice(0, 10), leilao: c.lei_nome, fil: String(c.fil).trim(),
        lote: c.lot_lote, animais: Number(c.lot_qtd) || 0,
        valor: Math.round(Number(c.lot_total) * (Number(c.cop_porcentagem ?? 100) / 100) * 100) / 100,
    })
    compradores.set(k, p)
}

const idxCompradores = new Identidades()
for (const p of compradores.values()) idxCompradores.add(p, { doc: p.cpf, fone: p.fone, nome: p.nome })
const idxAprovadoGrupo = new Identidades()
for (const a of [...APROVADOS_GRUPO, ...APROVADOS_LISTA]) idxAprovadoGrupo.add(a, { doc: a.cpf, fone: a.fone, nome: a.cliente })

/* PASSE 1 — cada comprador do ERP fica com UM lead candidato: o que tiver a
   prova mais forte e, em empate, a entrada mais antiga. */
const disputam = new Map()
const porComprador = new Map()
const descartados = []
for (const l of leads) {
    const achou = idxCompradores.busca({ doc: l.cpf, fone: l.fone, nome: l.nome })
    if (!achou) continue
    const c = achou.registro
    const ufLead = String(l.uf || '').trim().toUpperCase().slice(0, 2)
    const ufErp = String(c.uf || '').trim().toUpperCase().slice(0, 2)
    const forte = achou.via === 'cpf' || achou.via === 'telefone'
    const conf = forte ? 'alta'
        : (ufLead && ufErp && ufLead === ufErp) ? 'media'
            : (!ufLead || !ufErp) ? 'a-confirmar' : 'descartado'
    if (conf === 'descartado') {
        descartados.push({ lead: l.nome, ufLead, erp: c.nome, ufErp, motivo: 'nome bate mas UF é outra' })
        continue
    }
    const telefoneBate = !!(foneKey(c.fone) && foneKey(l.fone) && foneKey(c.fone) === foneKey(l.fone))
    disputam.set(c.codigo, (disputam.get(c.codigo) ?? 0) + 1)
    const cand = { c, l, conf, via: achou.via, ufLead, ufErp, telefoneBate }
    const ja = porComprador.get(c.codigo)
    const peso = x => (x.telefoneBate ? 100 : 0) + ({ alta: 3, media: 2, 'a-confirmar': 1 }[x.conf] ?? 0)
    if (!ja || peso(cand) > peso(ja) || (peso(cand) === peso(ja) && l.data && l.data < ja.l.data)) {
        porComprador.set(c.codigo, cand)
    }
}

/* PASSE 2 — grau de evidência e separação entre compra posterior ao lead
   (mérito da campanha) e compra anterior (já era cliente da casa). */
let jaEramClientes = 0
for (const { c, l, conf, via, telefoneBate } of porComprador.values()) {
    const disputantes = disputam.get(c.codigo) ?? 1
    const posteriores = (l.campanha && !l.data) ? [] : c.compras.filter(x => l.data && x.data >= l.data)
    const telefoneRefuta = !!(foneKey(c.fone) && foneKey(l.fone) && !telefoneBate)
    const assessorConfirma = CONFIRMADO_PELO_ASSESSOR.has(String(c.nome).trim().toUpperCase())
    const aprovadoNoGrupo = !!idxAprovadoGrupo.busca({ doc: c.cpf, fone: c.fone, nome: c.nome })
    const cadastroNasceuNoFunil = !!(c.dataCadastro && l.data && c.dataCadastro >= l.data)
    const evidencia =
        (via === 'cpf' || via === 'telefone' || telefoneBate) ? 'telefone/CPF confere'
            : telefoneRefuta ? 'REFUTADO (telefone do HastaPro é outro)'
                : disputantes > 2 ? 'REFUTADO (nome comum, vários leads disputam)'
                    : assessorConfirma ? 'confirmado pelo assessor'
                        : (aprovadoNoGrupo && cadastroNasceuNoFunil) ? 'cadeia completa: lead → aprovado → cadastro → compra'
                            : conf === 'media' ? 'nome + UF conferem'
                                : 'identidade não estabelecida'
    if (evidencia.startsWith('REFUTADO') || evidencia === 'identidade não estabelecida') {
        descartados.push({ lead: l.nome, erp: c.nome, motivo: evidencia, valorAno: c.compras.reduce((a, x) => a + x.valor, 0) })
        continue
    }
    l.comprador = { nome: c.nome, via, evidencia, disputantes, dataCadastroErp: c.dataCadastro }
    if (!posteriores.length) { jaEramClientes++; l.jaEraCliente = true; continue }
    l.compra = {
        animais: posteriores.reduce((a, x) => a + x.animais, 0),
        valor: Math.round(posteriores.reduce((a, x) => a + x.valor, 0) * 100) / 100,
        primeira: posteriores.map(x => x.data).sort()[0],
        arremates: posteriores.length,
        leiloes: [...new Set(posteriores.map(x => x.leilao))],
        filiais: [...new Set(posteriores.map(x => x.fil))],
        diasAteCompra: Math.round((new Date(posteriores.map(x => x.data).sort()[0]) - new Date(l.data)) / 86400000),
    }
}

/* ══ 6. MONTAGEM DO FUNIL, CAMPANHA A CAMPANHA ════════════════════════════ */

const deCampanha = leads.filter(l => l.campanha)

/* CONFIRMAÇÃO HUMANA — contada à parte, nunca somada à medição.
   Alguns leads chegaram pela landing sem parâmetro nenhum na URL: dá para provar
   que vieram da página, não de qual campanha. Quando o assessor que atendeu
   afirma a origem por escrito (lista de patrocinados enviada em 14/08) e o ERP
   confirma valor e data, o caso existe — mas como DECLARAÇÃO, e o painel mostra
   nessa condição, separado do que foi medido pelo parâmetro da URL.
   O mapa abaixo é curto e explícito de propósito: uma landing só vira campanha
   aqui quando alguém assinou embaixo. */
const CAMPANHA_DA_LANDING_DECLARADA = {
    'Landing São Geraldo': '120249560579230708',      // LEADS - SAO GERALDO
    'Landing Touros': '120249455058620708',            // LEAD - PERPETUO TOURO
    'Landing Fêmeas — Funil Perpétuo': '120249845218920708',
}
const confirmadosPeloAssessor = []
for (const l of leads) {
    if (l.campanha || !l.compra) continue
    if (!CONFIRMADO_PELO_ASSESSOR.has(String(l.comprador?.nome ?? '').trim().toUpperCase())) continue
    const id = CAMPANHA_DA_LANDING_DECLARADA[String(l.origem ?? '').trim()]
    if (!id) continue
    confirmadosPeloAssessor.push({
        campanha: id, lead: l.nome, uf: l.uf, dataLead: l.data, origem: l.origem,
        comprador: l.comprador.nome, valor: l.compra.valor, animais: l.compra.animais,
        primeiraCompra: l.compra.primeira, etapa: l.etapa,
        base: 'lista de patrocinados do assessor (14/08), conferida lote a lote no ERP',
    })
}
const funis = meta.snapshot.campanhas.map(c => {
    const meus = deCampanha.filter(l => l.campanha === c.id)
    const mql = meus.filter(l => l.mql)
    const cad = cadastrosUnicos.filter(x => x.lead && x.lead.campanha === c.id)
    const submetidos = cad.length
    const aprovados = cad.filter(x => x.status === 'aprovado').length
    const clientes = meus.filter(l => l.compra)
    const animais = clientes.reduce((a, l) => a + l.compra.animais, 0)
    const faturamento = clientes.reduce((a, l) => a + l.compra.valor, 0)
    // Campanha de FORMULÁRIO instantâneo não tem "acesso": o formulário abre
    // dentro do próprio Meta e não existe página para visitar — aí a etapa ACESSOS
    // do quadro da meta simplesmente não se aplica, e forçar um número ali seria
    // inventar. Quem separa os dois é o CLIQUE DE SAÍDA (clique que sai do Meta),
    // não a visita de página: a campanha "13/06 e 14/06 LEADS JMP SITE" mandava
    // 59% dos cliques para o site e mesmo assim registrou só 75 visitas, porque o
    // pixel do site estava captando mal — medir pelo pixel a classificaria como
    // formulário, que é justamente o contrário do que ela era.
    const saida = (c.cliques ?? 0) ? (c.cliquesSaida ?? 0) / c.cliques : 0
    const tipo = saida >= 0.30 ? 'landing' : saida < 0.05 ? 'formulario' : 'mista'
    // O pixel da página também pode estar quebrado: a "13/06 e 14/06 LEADS JMP
    // SITE" mandou 1.898 cliques para fora do Meta e o pixel registrou 75
    // visitas — 4%. Usar esse número como ACESSOS produziria "137% dos acessos
    // viraram lead", que é impossível. Então o número é mostrado, mas marcado
    // como não confiável, e a taxa não é calculada em cima dele.
    const acessosConfiaveis = (c.cliquesSaida ?? 0) > 0 && (c.acessos ?? 0) / c.cliquesSaida >= 0.5
    const ehLanding = tipo === 'landing' && acessosConfiaveis
    return {
        id: c.id, nome: c.nome, status: c.status, inicio: c.inicio,
        tipo,
        cliqueDeSaidaPct: Math.round(saida * 1000) / 10,
        acessosConfiaveis,
        mensal: meta.snapshot.mensal?.[c.id] ?? {},
        midia: {
            investido: c.investido, impressoes: c.impressoes, alcance: c.alcance,
            cliques: c.cliques, cliquesSaida: c.cliquesSaida, acessos: c.acessos ?? null,
            acessosNaTaxa: ehLanding ? c.acessos : null,
            leadsMeta: c.leadsMeta ?? 0, ctr: c.ctr, cpc: c.cpc, cpm: c.cpm,
        },
        etapas: {
            leads: meus.length,
            mql: mql.length,
            cadastrosSubmetidos: submetidos,
            cadastrosAprovados: aprovados,
            clientes: clientes.length,
        },
        resultado: {
            animais,
            faturamento,
            ticket: clientes.length ? faturamento / clientes.length : 0,
            ticketPorAnimal: animais ? faturamento / animais : 0,
        },
        taxas: taxas({ impressoes: c.impressoes, cliques: c.cliques, acessos: ehLanding ? c.acessos : null, leads: meus.length, mql: mql.length, submetidos, aprovados, clientes: clientes.length, animais }),
        custos: {
            porLead: meus.length ? c.investido / meus.length : null,
            porMql: mql.length ? c.investido / mql.length : null,
            porCadastro: submetidos ? c.investido / submetidos : null,
            porAprovado: aprovados ? c.investido / aprovados : null,
            porCliente: clientes.length ? c.investido / clientes.length : null,
            porAnimal: animais ? c.investido / animais : null,
        },
        trabalho: contaPor(meus, l => l.etapa || '(sem etapa)'),
        // Por onde o lead desta campanha entrou. Quando aparece a landing de OUTRO
        // produto, é anúncio apontando para a página errada — e isso custa dinheiro.
        origensDosLeads: contaPor(meus, l => l.origem || '(sem origem)'),
        responsaveis: contaPor(meus.filter(l => l.atendidoPor), l => normalizaNome(l.atendidoPor)),
        leadsPorMes: contaPor(meus.filter(l => l.data), l => l.data.slice(0, 7)),
        detalheClientes: clientes.map(l => ({
            lead: l.nome, uf: l.uf, dataLead: l.data, via: l.comprador.via,
            comprador: l.comprador.nome, primeiraCompra: l.compra.primeira,
            animais: l.compra.animais, valor: l.compra.valor,
            leiloes: l.compra.leiloes, filiais: l.compra.filiais,
            etapa: l.etapa, atendidoPor: l.atendidoPor,
        })),
        detalheCadastros: cad.map(x => ({ nome: x.lead.nome, status: x.status, fontes: [...new Set(x.fontes)], data: x.data })),
        declarado: confirmadosPeloAssessor.filter(x => x.campanha === c.id),
    }
})

/**
 * META DO TIME (quadro "META FUNIL DE VENDAS MENSAL", trazido pela diretoria).
 * As taxas abaixo reproduzem o quadro exatamente: aplicadas em cadeia sobre
 * R$ 6.500 de investimento e CPM de R$ 10, devolvem os mesmos 650.000
 * impressões → 7.800 cliques → 5.850 acessos → 702 leads → 140,4 MQL →
 * 56,16 cadastros → 33,696 aprovados → 13,478 clientes → 40,435 animais →
 * R$ 1.010.880. Conferência dos custos do quadro: 6.500/702 = 9,26 (CPL),
 * 6.500/140,4 = 46,30 (CPMQL), 6.500/56,16 = 115,74 (por cadastro) e
 * 6.500/40,435 = 160,75 (por venda — que no quadro é por ANIMAL, não por
 * cliente). Estão aqui para o painel comparar taxa com taxa, e não volume com
 * volume: a meta é mensal e as campanhas têm durações diferentes.
 */
export const METAS = {
    investimentoMensal: 6500,
    ctr: 1.20,                 // cliques / impressões
    acessoPorClique: 75,       // acessos / cliques
    leadPorAcesso: 12,         // leads / acessos
    mqlPorLead: 20,            // MQL / leads
    cadastroPorMql: 40,        // cadastros submetidos / MQL
    aprovadoPorCadastro: 60,   // aprovados / submetidos
    clientePorAprovado: 40,    // clientes / aprovados
    animaisPorCliente: 3,
    ticketPorAnimal: 25000,
}
function taxa(a, b) { return b ? Math.round((a / b) * 10000) / 100 : null }
function taxas(x) {
    return {
        ctr: taxa(x.cliques, x.impressoes),
        acessoPorClique: x.acessos == null ? null : taxa(x.acessos, x.cliques),
        leadPorAcesso: x.acessos == null ? null : taxa(x.leads, x.acessos),
        leadPorClique: taxa(x.leads, x.cliques),
        mqlPorLead: taxa(x.mql, x.leads),
        cadastroPorMql: taxa(x.submetidos, x.mql),
        aprovadoPorCadastro: taxa(x.aprovados, x.submetidos),
        clientePorAprovado: taxa(x.clientes, x.aprovados),
        animaisPorCliente: x.clientes ? Math.round((x.animais / x.clientes) * 100) / 100 : null,
    }
}
function normalizaNome(s) {
    return String(s).trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s)\S/g, t => t.toUpperCase())
}
function contaPor(arr, f) {
    const m = new Map()
    for (const x of arr) { const k = f(x); m.set(k, (m.get(k) ?? 0) + 1) }
    return Object.fromEntries([...m].sort((a, b) => b[1] - a[1]))
}

/* ══ 7. O QUE FICOU FORA (e por quê) ══════════════════════════════════════ */

const semAtribuicao = leads.filter(l => !l.campanha)
const fora = {
    total: semAtribuicao.length,
    porClasse: contaPor(semAtribuicao, l => l.classe),
    // leads que chegaram por uma landing de campanha mas sem parâmetro nenhum
    // na URL — são reais, vieram da landing, mas não provam de qual campanha
    landingSemParametro: semAtribuicao.filter(l => l.classe === 'campanha')
        .map(l => ({
            data: l.data, nome: l.nome, origem: l.origem, uf: l.uf, mql: l.mql, etapa: l.etapa,
            comprou: l.compra ? { valor: l.compra.valor, animais: l.compra.animais, primeira: l.compra.primeira, evidencia: l.comprador?.evidencia } : null,
        })),
}
// quanto de venda está preso em lead sem parâmetro de campanha na URL
fora.vendaSemCampanha = fora.landingSemParametro.filter(x => x.comprou)
    .reduce((a, x) => ({ clientes: a.clientes + 1, valor: a.valor + x.comprou.valor, animais: a.animais + x.comprou.animais }), { clientes: 0, valor: 0, animais: 0 })

const cadastrosSemLead = cadastrosUnicos.filter(c => !c.lead)
const saida = {
    geradoEm: new Date().toISOString().slice(0, 10),
    metaExtraidoEm: meta.snapshot.extraidoEm,
    universo: {
        registrosPlanilha: abas['LEADS GERAIS'].length,
        registrosDoCrmSoNoCrm: doCrm,
        lixoDescartado: lixo,
        pessoasDepoisDaDedup: leads.length,
        repreenchimentos: repetidos.length,
        pessoasDeCampanha: deCampanha.length,
    },
    totais: {
        investido: funis.reduce((a, f) => a + f.midia.investido, 0),
        impressoes: funis.reduce((a, f) => a + f.midia.impressoes, 0),
        cliques: funis.reduce((a, f) => a + f.midia.cliques, 0),
        leads: funis.reduce((a, f) => a + f.etapas.leads, 0),
        mql: funis.reduce((a, f) => a + f.etapas.mql, 0),
        cadastrosSubmetidos: funis.reduce((a, f) => a + f.etapas.cadastrosSubmetidos, 0),
        cadastrosAprovados: funis.reduce((a, f) => a + f.etapas.cadastrosAprovados, 0),
        clientes: funis.reduce((a, f) => a + f.etapas.clientes, 0),
        faturamento: funis.reduce((a, f) => a + f.resultado.faturamento, 0),
        animais: funis.reduce((a, f) => a + f.resultado.animais, 0),
    },
    metas: METAS,
    confirmadosPeloAssessor,
    funis,
    fora,
    janelas: {
        midia: 'Meta Ads, 2026-01-01 a 2026-08-17 (extração ao vivo)',
        leads: 'planilha de leads, primeiro registro 06/06/2026, até 17/08/2026',
        cadastroSistema: 'cliente_leiloeira_cadastro cobre SÓ 08 a 12/07/2026 — depois disso a submissão deixou de virar registro',
        cadastroGrupos: 'leitura manual dos grupos, 08/07 a 14/08/2026. Conferido em 17/08: entre 15 e 17/08 não há veredito classificável nos grupos (duas consultas sem desfecho)',
        compras: 'HastaPro, leilões de 2026 inteiros, todas as filiais',
    },
    cadastrosForaDeOrdem,
    cadastros: {
        pessoasComDecisao: cadastrosUnicos.length,
        aprovados: cadastrosUnicos.filter(c => c.status === 'aprovado').length,
        recusados: cadastrosUnicos.filter(c => c.status === 'recusado').length,
        submetidosSemDecisao: cadastrosUnicos.filter(c => c.status === 'submetido').length,
        casadosComLeadDeCampanha: cadastrosUnicos.filter(c => c.lead?.campanha).length,
        semLeadNenhum: cadastrosSemLead.length,
        detalheSemLead: cadastrosSemLead.map(c => ({ nome: c.nome, status: c.status, fontes: [...new Set(c.fontes)] })),
    },
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'funil-por-campanha.json'), JSON.stringify(saida, null, 1))

/* O painel do sistema lê este mesmo arquivo. Ele vai para dentro de src/ porque
   o servidor não tem credencial da Meta nem do HastaPro — a apuração pesada é
   feita aqui, versionada, e o painel só apresenta. A data da apuração aparece
   no próprio painel, para ninguém confundir com tempo real. */
const enxuto = {
    ...saida,
    funis: saida.funis.map(f => ({ ...f, detalheCadastros: f.detalheCadastros })),
}
fs.writeFileSync(path.join(ROOT_SRC, 'funil-campanhas.json'), JSON.stringify(enxuto))
console.log('publicado em src/lib/funil-campanhas.json')

/* ── console ─────────────────────────────────────────────────────────────── */
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
console.log('UNIVERSO:', JSON.stringify(saida.universo))
console.log('\n%s | %s | %s | %s | %s | %s | %s | %s', 'CAMPANHA'.padEnd(38), 'INVEST'.padStart(10), 'LEADS'.padStart(6), 'MQL'.padStart(5), 'SUBM'.padStart(5), 'APROV'.padStart(5), 'CLI'.padStart(4), 'FATURAMENTO'.padStart(13))
for (const f of funis) {
    console.log('%s | %s | %s | %s | %s | %s | %s | %s',
        f.nome.padEnd(38), brl(f.midia.investido).padStart(10), String(f.etapas.leads).padStart(6),
        String(f.etapas.mql).padStart(5), String(f.etapas.cadastrosSubmetidos).padStart(5),
        String(f.etapas.cadastrosAprovados).padStart(5), String(f.etapas.clientes).padStart(4),
        brl(f.resultado.faturamento).padStart(13))
}
console.log('\nTOTAIS:', JSON.stringify(saida.totais))
console.log('FORA (sem prova de campanha):', JSON.stringify(fora.porClasse))
console.log('CADASTROS:', JSON.stringify({ ...saida.cadastros, detalheSemLead: `${cadastrosSemLead.length} nomes` }))
console.log('\ngravado em', path.relative(process.cwd(), path.join(OUT, 'funil-por-campanha.json')))
