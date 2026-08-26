/**
 * Cruza os CR em aberto do ERP com a aba "Leiloes" do workbook mestre
 * (FINANCEIRO BULA 2026, Drive) para achar titulo que o ERP acha em aberto e a
 * planilha ja da como RECEBIDO.
 *
 * MOTIVACAO (26/08): o painel de Fluxo de Caixa mostrava 288.837,10 "vencido",
 * a maior parte de leiloes de marco/abril que a planilha marca RECEBIDO ha
 * meses. A cobranca retroativa de 18/08 criou CR para leilao ja liquidado.
 *
 * O CASAMENTO E HEURISTICA E ELE SABE DISSO. Agenda/planilha e fechamento nao
 * tem chave em comum. A primeira versao deste script casou "1o NELORE SAO
 * FRANCISCO" com "18o MEGA LEILAO NELORE" so porque as duas tem a palavra
 * "NELORE" — e teria dado 355 mil de baixa errada. Regra atual, deliberadamente
 * conservadora:
 *
 *   1. TOKEN DISTINTIVO obrigatorio. Palavra que aparece em mais de 3 leiloes da
 *      planilha (NELORE, TOUROS, MATRIZES...) nao identifica nada. Sem ao menos
 *      um token raro em comum, nao e candidato.
 *   2. DATA confirma. A data do leilao vem do fechamento vinculado (nao do texto
 *      da descricao) e precisa cair no mesmo mes, com ate 2 dias de folga.
 *   3. Quem nao passa nos dois vira REVISAR — pedido de conferencia humana,
 *      nunca baixa automatica.
 *
 * Dry-run por padrao. Com --apply, baixa SOMENTE os classificados como CONFIRMADO.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import XLSX from 'xlsx'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const XLSX_PATH = 'outputs/workbook-2026-08-26/FINANCEIRO_BULA_2026.xlsx'
const f = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(11)
const MESES: Record<string, number> = { JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9 }
const DIACRITICOS = String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f)
const RE_DIA = new RegExp('[' + DIACRITICOS + ']', 'g')
const norm = (s: unknown) => String(s || '').toUpperCase().normalize('NFD').replace(RE_DIA, '')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, " ").trim()
/** Palavras que aparecem em todo leilao e por isso nao identificam nenhum. */
const RUIDO = new Set(['LEILAO', 'DE', 'DO', 'DA', 'DOS', 'DAS', 'COMISSAO', 'BULA', 'VIRTUAL', 'MEGA', 'ETAPA',
    'ED', 'EDICAO', 'DIA', 'ANOS', 'DUPLA', 'DUPLO', 'DIAS', 'DUP', 'LT', 'REMATES', 'AGROPECUARIA', 'FAZENDA', 'FAZ'])
const tokens = (s: unknown) => new Set(norm(s).split(' ').filter(t => t.length > 2 && !RUIDO.has(t) && !/^\d+$/.test(t)))

/* ---------- planilha ------------------------------------------------------ */
const wb = XLSX.readFile(XLSX_PATH)
const raw = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Leilões'], { header: 1, defval: '' })
type Linha = { mes: number; dia: number; nome: string; status: string; obs: string; toks: Set<string> }
const planilha: Linha[] = []
for (const x of raw.slice(1)) {
    const nome = String(x[3] || '').trim()
    const mes = MESES[norm(x[1])]
    if (!nome || !mes) continue
    planilha.push({ mes, dia: Number(x[2]) || 0, nome, status: norm(x[10]), obs: String(x[15] || ''), toks: tokens(nome) })
}
/** frequencia do token na planilha: >3 ocorrencias = palavra generica */
const freq = new Map<string, number>()
for (const p of planilha) for (const t of p.toks) freq.set(t, (freq.get(t) || 0) + 1)
const distintivo = (t: string) => (freq.get(t) || 0) <= 3
console.log(`planilha: ${planilha.length} leiloes · ${freq.size} tokens · genericos: ` +
    [...freq].filter(([, n]) => n > 3).map(([t]) => t).join(', '))

/* ---------- CR em aberto + data real do leilao ---------------------------- */
const { data: crs } = await sb.from('erp_contas_receber')
    .select('id,descricao,valor,valor_recebido,desconto,juros,multa,vencimento,status,observacoes,fechamento_id')
    .in('status', ['aberto', 'parcial', 'vencido']).order('vencimento')
const { data: fechs } = await sb.from('bula_leilao_fechamento').select('id,data,nome')
const dataFech = new Map((fechs || []).map(x => [x.id, String(x.data).slice(0, 10)]))
const rest = (r: Record<string, number>) => Number(r.valor || 0) - Number(r.desconto || 0) + Number(r.juros || 0) + Number(r.multa || 0) - Number(r.valor_recebido || 0)

/**
 * Regra 1b: leilao de TOUROS e leilao de FEMEAS do mesmo criador, na mesma
 * data, sao eventos diferentes com receitas diferentes. Sem esta trava o
 * casamento dava "10o LEILAO NELORE JMP - TOUROS" -> "LEILAO JMP - FEMEAS".
 */
const MACHO = /(TOUROS?|MACHOS?|REPRODUTORES?)/
const FEMEA = /(FEMEAS?|MATRIZES?|BEZERRAS?|DOADORAS?|PRENHE|ASPIRAC)/
const categoria = (s: unknown) => { const n = norm(s)
    const m = MACHO.test(n), f2 = FEMEA.test(n)
    return m && !f2 ? 'M' : f2 && !m ? 'F' : null }
const categoriaBate = (a: unknown, b: unknown) => {
    const ca = categoria(a), cb = categoria(b)
    return !ca || !cb || ca === cb
}

const RECEBIDO = (st: string) => /^RECEBIDO/.test(st)
type Veredito = 'CONFIRMADO' | 'PENDENTE' | 'REVISAR'
const achados: { cr: NonNullable<typeof crs>[number]; hit: Linha | null; veredito: Veredito; motivo: string }[] = []

for (const cr of crs || []) {
    const t = tokens(cr.descricao)
    const raros = [...t].filter(distintivo)
    const iso = cr.fechamento_id ? dataFech.get(cr.fechamento_id) : null
    const dt = iso ? { mes: +iso.slice(5, 7), dia: +iso.slice(8, 10) } : null

    let melhor: Linha | null = null, melhorRaros = 0
    for (const p of planilha) {
        const comunsRaros = raros.filter(x => p.toks.has(x))
        if (!comunsRaros.length) continue                                  // regra 1
        if (!dt || dt.mes !== p.mes || Math.abs(dt.dia - p.dia) > 2) continue // regra 2
        if (!categoriaBate(cr.descricao, p.nome)) continue                    // regra 1b
        if (comunsRaros.length > melhorRaros) { melhorRaros = comunsRaros.length; melhor = p }
    }
    if (!melhor) {
        achados.push({
            cr, hit: null, veredito: 'REVISAR',
            motivo: !dt ? 'CR sem fechamento vinculado — sem data para confirmar'
                : !raros.length ? 'descricao so tem palavra generica (nenhum token distintivo)'
                    : `nenhum leilao da planilha em ${String(dt.mes).padStart(2, '0')} +/-2d com token distintivo e mesma categoria (${categoria(cr.descricao) || 'n/d'})`,
        })
        continue
    }
    achados.push({
        cr, hit: melhor,
        veredito: RECEBIDO(melhor.status) ? 'CONFIRMADO' : 'PENDENTE',
        motivo: `${melhorRaros} token(s) distintivo(s) + data`,
    })
}

const bloco = (v: Veredito) => achados.filter(a => a.veredito === v)
const soma = (xs: typeof achados) => xs.reduce((s, a) => s + rest(a.cr as never), 0)

console.log(`\n${'='.repeat(100)}\nCR em aberto no ERP: ${(crs || []).length} titulos · ${f(soma(achados))}\n${'='.repeat(100)}`)

console.log(`\n### CONFIRMADO RECEBIDO NA PLANILHA — dar baixa (${bloco('CONFIRMADO').length} tit · ${f(soma(bloco('CONFIRMADO')))})`)
for (const a of bloco('CONFIRMADO'))
    console.log(`  ${a.cr.vencimento} ${f(rest(a.cr as never))}  ${String(a.cr.descricao).slice(0, 46).padEnd(48)}\n      planilha: ${a.hit!.nome.slice(0, 40).padEnd(42)} ${String(a.hit!.mes).padStart(2, '0')}/${String(a.hit!.dia).padStart(2, '0')}  [${a.hit!.status}]  ${a.hit!.obs.slice(0, 30)}`)

console.log(`\n### PENDENTE TAMBEM NA PLANILHA — ERP certo, nao mexer (${bloco('PENDENTE').length} tit · ${f(soma(bloco('PENDENTE')))})`)
for (const a of bloco('PENDENTE'))
    console.log(`  ${a.cr.vencimento} ${f(rest(a.cr as never))}  ${String(a.cr.descricao).slice(0, 44).padEnd(46)} -> ${a.hit!.nome.slice(0, 28).padEnd(30)} [${a.hit!.status}]`)

console.log(`\n### REVISAR — o script NAO sabe, decisao humana (${bloco('REVISAR').length} tit · ${f(soma(bloco('REVISAR')))})`)
for (const a of bloco('REVISAR'))
    console.log(`  ${a.cr.vencimento} ${f(rest(a.cr as never))}  ${String(a.cr.descricao).slice(0, 52).padEnd(54)} ${a.motivo}`)

/* ---------- baixa ---------------------------------------------------------- */
if (APPLY) {
    console.log('\nAplicando baixa nos CONFIRMADOS...')
    for (const a of bloco('CONFIRMADO')) {
        const nota = ` [PLANILHA 26/08] Baixado por conferencia com o workbook mestre (aba Leiloes): "${a.hit!.nome}" ${String(a.hit!.mes).padStart(2, '0')}/${String(a.hit!.dia).padStart(2, '0')} consta ${a.hit!.status}${a.hit!.obs ? ' (' + a.hit!.obs + ')' : ''}. Casamento por ${a.motivo}.`
        const { error } = await sb.from('erp_contas_receber').update({
            status: 'recebido', valor_recebido: a.cr.valor, forma_recebimento: 'a_confirmar',
            observacoes: (a.cr.observacoes || '') + nota,
        }).eq('id', a.cr.id)
        if (error) console.error('  ERRO ' + a.cr.id.slice(0, 8) + ': ' + error.message)
        else console.log(`  baixado ${f(rest(a.cr as never))}  ${String(a.cr.descricao).slice(0, 52)}`)
    }
}

fs.writeFileSync('outputs/workbook-2026-08-26/conciliacao-cr-planilha.json',
    JSON.stringify(achados.map(a => ({
        id: a.cr.id, venc: a.cr.vencimento, desc: a.cr.descricao, restante: rest(a.cr as never),
        veredito: a.veredito, motivo: a.motivo, planilha: a.hit,
    }), (k, v) => v instanceof Set ? [...v] : v), null, 1))
console.log('\n' + (APPLY ? 'APLICADO.' : 'DRY-RUN. Use --apply para baixar os CONFIRMADOS.'))
