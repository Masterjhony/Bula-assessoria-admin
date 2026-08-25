/**
 * Garante que todo cliente enviado aos grupos de cadastro das leiloeiras esteja
 * na página Clientes — inclusive os negados.
 *
 * O fluxo real: a Bula manda o cliente no grupo da leiloeira ("Cadastros Bula
 * Remates", "Cadastros Bula e Programa") e a leiloeira responde se tem cadastro,
 * se aprovou ou se recusou. Esse vai-e-vem é a porta de entrada de cliente novo
 * e não estava chegando ao ERP: quem consulta a página Clientes não vê quem foi
 * submetido nem quem foi negado, e acaba submetendo o mesmo cliente de novo.
 *
 * As fichas NÃO seguem o formato #CAD que o parser antigo esperava — são texto
 * livre, do tipo:
 *
 *     Nome: Marcionei Luiz dos Santos
 *     IE: 95948128-80
 *     CPF: 802.873.879-68
 *
 * ou simplesmente "Geraldo Majela de Brito CPF 363.246.476-68". O documento é a
 * âncora: é o único campo que identifica a pessoa sem ambiguidade.
 *
 *   npx tsx scripts/importa-cadastros-grupo-leiloeiras.mts           (dry-run)
 *   npx tsx scripts/importa-cadastros-grupo-leiloeiras.mts --apply
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})
const APPLY = process.argv.includes('--apply')

const soDigitos = (s: string) => String(s || '').replace(/\D/g, '')
const chave = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const RE_CPF = /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/
const RE_CNPJ = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/

/**
 * Digito verificador. Sem isso, uma mencao do WhatsApp (@10247909437577) ou um
 * telefone entram como CNPJ — a primeira versao criou "Essa aqui @ ce consegue
 * info?" como cliente, com o @lid de 14 digitos no lugar do documento.
 */
function cpfValido(d: string) {
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
    for (const [ate, pos] of [[9, 10], [10, 11]] as const) {
        let soma = 0
        for (let i = 0; i < ate; i++) soma += Number(d[i]) * (pos - i)
        const dv = (soma * 10) % 11 % 10
        if (dv !== Number(d[ate])) return false
    }
    return true
}
function cnpjValido(d: string) {
    if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
    const calc = (ate: number) => {
        const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        let soma = 0
        for (let i = 0; i < ate; i++) soma += Number(d[i]) * pesos[i]
        const r = soma % 11
        return r < 2 ? 0 : 11 - r
    }
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}
const docValido = (d: string) => (d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false)
const RE_IE = /\bI\.?E\.?\s*:?\s*([\d.\-/]{6,20})/i

/** Palavras que aparecem na linha do nome e não fazem parte dele. */
const RUIDO = /^(nome|cliente|comprador|razao social|razão social)\s*:?\s*/i

function extraiFicha(texto: string): { nome: string | null; doc: string; tipo: 'cpf' | 'cnpj'; ie: string | null } | null {
    const t = String(texto || '')
    const mCnpj = t.match(RE_CNPJ)
    const mCpf = t.match(RE_CPF)
    // Prefere o que passa no digito verificador — texto de grupo tem telefone,
    // @lid e numero de lote soltos que casam com a mascara mas nao sao documento.
    const candidatos = [mCnpj?.[1], mCpf?.[1]].filter(Boolean).map((x) => soDigitos(String(x)))
    const doc = candidatos.find(docValido) ?? ''
    if (!doc) return null

    // Nome: linha marcada com "Nome:", senão a linha que contém o documento
    // (sem ele), senão a primeira linha com cara de nome próprio.
    let nome: string | null = null
    for (const linha of t.split(/\r?\n/)) {
        if (/^\s*nome\s*:/i.test(linha)) { nome = linha.replace(RUIDO, '').trim(); break }
    }
    if (!nome) {
        for (const linha of t.split(/\r?\n/)) {
            if (!RE_CPF.test(linha) && !RE_CNPJ.test(linha)) continue
            const limpo = linha.replace(RE_CPF, '').replace(RE_CNPJ, '')
                .replace(/\bcpf\b|\bcnpj\b/gi, '').replace(RUIDO, '').replace(/[:\-–—]+/g, ' ').trim()
            if (limpo.length >= 5) { nome = limpo; break }
        }
    }
    const mIe = t.match(RE_IE)
    return {
        nome: nome ? nome.replace(/\s{2,}/g, ' ').slice(0, 90) : null,
        doc, tipo: doc.length === 14 ? 'cnpj' : 'cpf',
        ie: mIe ? mIe[1].trim() : null,
    }
}

// ── grupos de cadastro ─────────────────────────────────────────────────────
const { data: leiloeiras } = await sb.from('leiloeiras')
    .select('nome, whatsapp_group_id').not('whatsapp_group_id', 'is', null)
const jids = (leiloeiras ?? []).map(l => l.whatsapp_group_id as string)
const nomeLeiloeira = new Map((leiloeiras ?? []).map(l => [l.whatsapp_group_id as string, l.nome as string]))
if (!jids.length) { console.error('nenhuma leiloeira com grupo cadastrado'); process.exit(1) }
console.log(`grupos de cadastro: ${jids.length}`)
for (const l of leiloeiras ?? []) console.log(`   ${l.nome} — ${l.whatsapp_group_id}`)

async function todos<T>(t: string, sel: string, filtro: (q: never) => never): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await (filtro(sb.from(t).select(sel) as never) as never as {
            range: (a: number, b: number) => Promise<{ data: T[] | null; error: { message: string } | null }>
        }).range(from, from + 999)
        if (error) throw new Error(error.message)
        out.push(...(data ?? []))
        if (!data || data.length < 1000) break
    }
    return out
}

type Msg = { phone: string; body: string | null; created_at: string }
const msgs = await todos<Msg>('whatsapp_messages', 'phone,body,created_at',
    (q) => (q as never as { in: (c: string, v: string[]) => never }).in('phone', jids))
console.log(`mensagens lidas: ${msgs.length}`)

// ── fichas encontradas, deduplicadas pelo documento ────────────────────────
type Ficha = { nome: string | null; doc: string; tipo: 'cpf' | 'cnpj'; ie: string | null; quando: string; grupo: string }
const porDoc = new Map<string, Ficha>()
/**
 * O nome costuma vir na mensagem de cima ("Segue o cliente" / nome / documento
 * em balões separados). Quando a ficha nao traz nome, procura-se nas mensagens
 * vizinhas do MESMO grupo, dentro de 10 minutos.
 */
const ordenadas = [...msgs].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
/**
 * Nome de pessoa nao carrega verbo nem adverbio. Testar so o formato deixava
 * passar "Valida pf", "Fica bem resumido" e "Lead direcionado para Douglas" —
 * todos com cara de nome para uma expressao regular, nenhum deles um nome.
 * Particulas de nome (de, da, dos, e) ficam fora da lista de proposito.
 */
const PALAVRA_DE_CONVERSA = new Set([
    'para', 'pra', 'com', 'sem', 'onde', 'quando', 'porque', 'essa', 'esse', 'isso', 'este', 'esta',
    'aqui', 'ali', 'ai', 'veja', 'olha', 'olhe', 'fica', 'ficou', 'seria', 'valida', 'validar',
    'bem', 'mal', 'resumido', 'dados', 'lead', 'leads', 'direcionado', 'direcionada', 'cliente',
    'favor', 'segue', 'manda', 'envia', 'enviar', 'outro', 'outra', 'mais', 'menos', 'muito', 'pouco',
    'agora', 'hoje', 'ontem', 'amanha', 'sim', 'nao', 'tudo', 'nada', 'obrigado', 'obrigada',
    'bom', 'boa', 'dia', 'tarde', 'noite', 'consegue', 'consigo', 'pode', 'poderia', 'preciso',
    'cadastro', 'cadastrar', 'inscricao', 'propriedade', 'serao', 'sera', 'entregues', 'modelo',
    'aprovado', 'aprovada', 'recusado', 'negado', 'assessor', 'vamos', 'bacana', 'info', 'eao',
])
const ehNomeProprio = (l: string) => {
    if (l.length < 6 || l.length > 70) return false
    if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.\s]+$/.test(l)) return false
    const palavras = l.split(/\s+/).filter(Boolean)
    if (palavras.length < 2 || palavras.length > 6) return false
    return !palavras.some((pl) => PALAVRA_DE_CONVERSA.has(chave(pl)))
}

function nomeVizinho(idx: number): string | null {
    const base = ordenadas[idx]
    const t0 = new Date(String(base.created_at)).getTime()
    for (const passo of [-1, -2, 1, 2]) {
        const viz = ordenadas[idx + passo]
        if (!viz || viz.phone !== base.phone) continue
        if (Math.abs(new Date(String(viz.created_at)).getTime() - t0) > 10 * 60_000) continue
        for (const linha of String(viz.body ?? '').split(/\r?\n/).map((l) => l.replace(RUIDO, '').trim())) {
            if (ehNomeProprio(linha)) return linha
        }
    }
    return null
}

for (let i = 0; i < ordenadas.length; i++) {
    const m = ordenadas[i]
    const f0 = extraiFicha(String(m.body ?? ''))
    if (!f0) continue
    // O nome so vale se PARECER um nome. Chutar produz cliente chamado "Valida
    // pf" ou "Fica bem resumido" — pior do que cliente sem nome, porque parece
    // certo. Sem nome confiavel o documento vira a identidade e o registro sai
    // marcado para alguem completar.
    const nomeDireto = f0.nome && ehNomeProprio(f0.nome) ? f0.nome : null
    const f = { ...f0, nome: nomeDireto ?? nomeVizinho(i) }
    const anterior = porDoc.get(f.doc)
    // fica a ficha mais completa; empate, a mais recente
    const melhor = !anterior
        || (!!f.nome && !anterior.nome)
        || (!!f.ie && !anterior.ie)
        || (String(m.created_at) > anterior.quando && !!f.nome)
    if (melhor) {
        porDoc.set(f.doc, {
            ...f,
            nome: f.nome ?? anterior?.nome ?? null,
            ie: f.ie ?? anterior?.ie ?? null,
            quando: String(m.created_at), grupo: nomeLeiloeira.get(m.phone) ?? m.phone,
        })
    }
}
console.log(`fichas com documento: ${porDoc.size}`)

// ── quem já está em clientes ───────────────────────────────────────────────
const clientes = await todos<{ id: string; nome: string; cpf: string | null; match_key: string | null }>(
    'clientes', 'id,nome,cpf,match_key', (q) => q)
const porCpf = new Map<string, typeof clientes[number]>()
const porNome = new Map<string, typeof clientes[number]>()
for (const c of clientes) {
    const d = soDigitos(String(c.cpf ?? ''))
    if (d.length >= 11) porCpf.set(d, c)
    const k = chave(c.nome)
    if (k) porNome.set(k, c)
}

const novos: Ficha[] = []
const semCpf: { ficha: Ficha; cliente: typeof clientes[number] }[] = []
let jaOk = 0
for (const f of porDoc.values()) {
    const porDocumento = porCpf.get(f.doc)
    if (porDocumento) { jaOk++; continue }
    const porNomeIgual = f.nome ? porNome.get(chave(f.nome)) : undefined
    if (porNomeIgual) { semCpf.push({ ficha: f, cliente: porNomeIgual }); continue }
    novos.push(f)
}

console.log(`\n  ja em clientes com o documento: ${jaOk}`)
console.log(`  em clientes pelo NOME, mas sem o CPF gravado: ${semCpf.length}`)
console.log(`  ausentes da pagina Clientes: ${novos.length}`)

if (semCpf.length) {
    console.log('\nRECEBEM O DOCUMENTO QUE FALTAVA:')
    for (const x of semCpf.slice(0, 10)) console.log(`   ${x.cliente.nome.slice(0, 38).padEnd(38)} <- ${x.ficha.doc}`)
}
if (novos.length) {
    console.log('\nSERAO CRIADOS:')
    for (const f of novos.slice(0, 20))
        console.log(`   ${String(f.nome ?? '(sem nome)').slice(0, 38).padEnd(38)} ${f.tipo.toUpperCase()} ${f.doc}` +
            `${f.ie ? '  IE ' + f.ie : ''}  · ${f.grupo}`)
    if (novos.length > 20) console.log(`   … e mais ${novos.length - 20}`)
}

const semNome = novos.filter(f => !f.nome)
if (semNome.length) console.log(`
  ${semNome.length} ficha(s) sem nome legivel no texto — entram identificadas pelo documento e com a tag "revisar-nome".` +
    ` O cadastro costuma ir ao grupo como PDF ou imagem, e o nome nao aparece na conversa.`)

if (!APPLY) { console.log('\n(dry-run) use --apply para gravar'); process.exit(0) }

let criados = 0, atualizados = 0
for (const x of semCpf) {
    const { error } = await sb.from('clientes').update({
        cpf: x.ficha.doc,
        ...(x.ficha.ie ? { inscricao_estadual: x.ficha.ie, tem_inscricao_estadual: true } : {}),
    }).eq('id', x.cliente.id)
    if (error) console.error(`  ERRO ${x.cliente.nome}: ${error.message}`)
    else atualizados++
}
const rotulo = (f: Ficha) => f.nome
    ?? `A identificar · ${f.tipo.toUpperCase()} ${f.doc}`
for (const f of novos) {
    const nome = rotulo(f)
    const { error } = await sb.from('clientes').insert({
        nome, match_key: chave(nome), cpf: f.doc,
        ...(f.ie ? { inscricao_estadual: f.ie, tem_inscricao_estadual: true } : {}),
        status: 'cadastro_enviado',
        tags: f.nome ? ['grupo-leiloeira'] : ['grupo-leiloeira', 'revisar-nome'],
        observacoes: `Cadastro enviado ao grupo "${f.grupo}" em ${String(f.quando).slice(0, 10)} ` +
            `(importado de scripts/importa-cadastros-grupo-leiloeiras.mts).`,
    })
    if (error) console.error(`  ERRO ${f.nome}: ${error.message}`)
    else criados++
}
console.log(`\ncriados: ${criados}  |  documentos preenchidos: ${atualizados}`)
