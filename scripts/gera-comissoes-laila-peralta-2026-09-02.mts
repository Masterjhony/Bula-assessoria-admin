/**
 * Apuracao das comissoes devidas a LAILA, ao PERALTA e ao LUCAS MARTINS (02/09/2026).
 *
 * Pedido do Joao: "capte a verdade da coisa" a partir de TRES lastros:
 *   1. as conversas 1:1 da sessao `joao-automation` no VPS Baileys — inclusive
 *      a planilha que o Peralta mandou e os audios (transcritos);
 *   2. o ERP (fechamentos, contas a pagar, extrato conciliado);
 *   3. o HastaPro FIL '2' (cobertura Bula Assessoria) — o pisteiro do lote.
 *
 * Nada e digitado a mao: o JSON sai destas fontes e o PDF sai do JSON.
 *   npx tsx scripts/gera-comissoes-laila-peralta-2026-09-02.mts
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import * as FirebirdNS from 'node-firebird'

const Firebird: any = (FirebirdNS as any).default ?? FirebirdNS
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
const r2 = (n: number) => Math.round(n * 100) / 100
const OUT = 'outputs/comissoes-laila-peralta-2026-09'
const HOJE = '2026-09-02'

// ── HastaPro FIL '2' = cobertura da Bula Assessoria ────────────────────────
const dec = (v: any): any => Buffer.isBuffer(v) ? v.toString('latin1').trim() : v instanceof Date ? v.toISOString().slice(0, 10) : v
const db: any = await new Promise((res, rej) => Firebird.attach({
    host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT || 3050), database: env.HASTAPRO_DATABASE,
    user: env.HASTAPRO_USER || 'SYSDBA', password: env.HASTAPRO_PASSWORD, encoding: 'NONE',
}, (e: any, d: any) => e ? rej(e) : res(d)))
const q = (sql: string) => new Promise<any[]>((res, rej) => db.query(sql, [], (e: any, r: any[]) =>
    e ? rej(e) : res((r || []).map((x: any) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k.toLowerCase(), dec(v)]))))))

type Quem = 'PERALTA' | 'LAILA' | 'LUCAS'
type Lote = { data: string; leilao: string; lote: string; vgv: number; pisteiro: string; quem: Quem }
const quemDoNome = (s: string): Quem => /peralta/i.test(s) ? 'PERALTA' : /laila/i.test(s) ? 'LAILA' : 'LUCAS'
const RX: Record<Quem, RegExp> = { PERALTA: /peralta/i, LAILA: /laila/i, LUCAS: /lucas\s*martins/i }
const hastapro: Record<string, Lote[]> = { '2': [], '01': [] }
let lote11: any[] = []
try {
    for (const fil of ['2', '01']) {
        const rows = await q(`select le.LEI_NOME nome, le.LEI_DATA data, lo.LOT_LOTE lote, lo.LOT_TOTAL total, p.CLI_NOME pisteiro
            from LOTES lo join LEILAO le on le.LEI_CODIGO=lo.LEI_CODIGO and le.FIL_CODIGO=lo.FIL_CODIGO
            left join CLIENTES p on p.CLI_CODIGO = lo.LOT_PISTEIRO
            where lo.FIL_CODIGO='${fil}' and lo.LOT_DATA_VENDA between '2026-01-01' and '${HOJE}'
              and (upper(p.CLI_NOME) like '%PERALTA%' or upper(p.CLI_NOME) like '%LAILA%'
                   or upper(p.CLI_NOME) like '%LUCAS MARTINS%')
            order by lo.LOT_DATA_VENDA, lo.LOT_LOTE`)
        hastapro[fil] = rows.map(r => ({
            data: String(r.data).slice(0, 10), leilao: String(r.nome).trim(), lote: String(r.lote).trim(),
            vgv: Number(r.total || 0), pisteiro: String(r.pisteiro || '').trim(),
            quem: quemDoNome(String(r.pisteiro)),
        }))
    }
    // O lote 11 do Essencia (22/08) e o unico ponto do periodo em que HastaPro e
    // ERP nomeiam pessoas diferentes — guardar quem o HastaPro registra.
    const l11 = await q(`select p.CLI_NOME pisteiro, lo.LOT_TOTAL total, le.LEI_NOME nome, le.LEI_DATA data
        from LOTES lo join LEILAO le on le.LEI_CODIGO=lo.LEI_CODIGO and le.FIL_CODIGO=lo.FIL_CODIGO
        left join CLIENTES p on p.CLI_CODIGO = lo.LOT_PISTEIRO
        where lo.FIL_CODIGO='2' and lo.LOT_LOTE='11' and le.LEI_DATA = '2026-08-22'`)
    lote11 = l11.map(r => ({ pisteiro: String(r.pisteiro || '').trim(), vgv: Number(r.total || 0), leilao: String(r.nome).trim(), data: String(r.data).slice(0, 10) }))
} finally { try { db.detach() } catch { /* conexao ja caiu */ } }

// ── ERP: fechamentos com um dos dois no por_assessor ───────────────────────
const { data: fechs } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,data,por_assessor,vgv_total,receita_bula,lances,observacoes,origem')
    .gte('data', '2026-01-01').order('data')
const ehAlvo = (s: unknown) => /laila|peralta|lucas\s*martins/i.test(String(s ?? ''))
const erpFech = (fechs ?? []).flatMap(f => ((f.por_assessor ?? []) as any[])
    .filter(a => ehAlvo(a.nome))
    .map(a => ({
        id: f.id, leilao: f.nome, data: String(f.data).slice(0, 10), origem: f.origem,
        quem: quemDoNome(String(a.nome)),
        nome_no_fechamento: a.nome, vgv: Number(a.vgv || 0), pct: a.comissao_pct ?? null,
        comissao: Number(a.comissao || 0), observacao: a.observacao ?? null,
        lotes: ((f.lances ?? []) as any[]).filter(l => ehAlvo(l.assessor))
            .map(l => ({ lote: String(l.lote), vgv: Number(l.vgv || 0), assessor: l.assessor, comprador: l.comprador })),
    })))

// Lotes que o HastaPro da a um dos dois mas o fechamento credita a OUTRA pessoa
// (ou que nao estao em fechamento nenhum). Casa por (lote, vgv) na janela do
// leilao — casar so por valor+data inventa correspondencia.
const conflitos: any[] = []
for (const l of hastapro['2']) {
    const f = (fechs ?? []).find(x => Math.abs(new Date(x.data as string).getTime() - new Date(l.data).getTime()) <= 2 * 86400_000
        && ((x.lances ?? []) as any[]).some(y => String(y.lote).trim() === l.lote && Number(y.vgv) === l.vgv))
    if (!f) { conflitos.push({ ...l, situacao: 'sem-fechamento', creditado_a: null, fechamento: null }); continue }
    const lance = ((f.lances ?? []) as any[]).find(y => String(y.lote).trim() === l.lote && Number(y.vgv) === l.vgv)
    const dono = String(lance?.assessor ?? '')
    if (!RX[l.quem].test(dono))
        conflitos.push({ ...l, situacao: 'creditado-a-outro', creditado_a: dono, fechamento: f.nome })
}

// ── ERP: titulos, extrato, cadastro ────────────────────────────────────────
const { data: cps } = await sb.from('erp_contas_pagar').select('*')
    .or('descricao.ilike.%LAILA%,descricao.ilike.%PERALTA%,descricao.ilike.%LUCAS MARTINS%').order('vencimento')
const { data: mov } = await sb.from('erp_movimentos_bancarios').select('data,valor,tipo,descricao')
    .or('descricao.ilike.%LAILA%,descricao.ilike.%PERALTA%,descricao.ilike.%LUCAS%').order('data')
const { data: pessoas } = await sb.from('erp_pessoas').select('id,nome,documento,banco_pix,observacoes')
    .or('nome.ilike.%LAILA%,nome.ilike.%PERALTA%,nome.ilike.%GARCEZ%,nome.ilike.%LUCAS MARTINS%')
const { data: folha } = await sb.from('erp_folha_estrutura').select('nome,comissao_pct,ativo,apelidos,funcao,observacao')
    .or('nome.ilike.%LAILA%,nome.ilike.%PERALTA%,nome.ilike.%LUCAS%')

const dados = {
    geradoEm: HOJE,
    hastapro: {
        fil2: hastapro['2'],
        fil01_total: r2(hastapro['01'].reduce((a, b) => a + b.vgv, 0)),
        fil01_lotes: hastapro['01'].length,
        lote11,
    },
    erp: { fechamentos: erpFech, conflitos, contas_pagar: cps ?? [], extrato: mov ?? [], pessoas: pessoas ?? [], folha: folha ?? [] },
}
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(`${OUT}/dados.json`, JSON.stringify(dados, null, 1))

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
console.log(`HastaPro FIL '2': ${hastapro['2'].length} lotes · FIL '01': ${hastapro['01'].length} lotes (R$ ${brl(dados.hastapro.fil01_total)}, nao comissiona)`)
console.log(`lote 11 do Essencia 22/08 → pisteiro no HastaPro: ${lote11.map(x => x.pisteiro).join(', ') || '(nao achado)'}`)
for (const quem of ['PERALTA', 'LAILA', 'LUCAS']) {
    console.log(`\n=== ${quem} ===`)
    const porMes: Record<string, number> = {}
    for (const l of hastapro['2'].filter(x => x.quem === quem)) porMes[l.data.slice(0, 7)] = r2((porMes[l.data.slice(0, 7)] ?? 0) + l.vgv)
    for (const [m, v] of Object.entries(porMes).sort()) console.log(`  HP ${m}  VGV FIL2 R$ ${brl(v)}`)
    for (const f of erpFech.filter(x => x.quem === quem))
        console.log(`  ERP ${f.data} ${f.leilao.slice(0, 42).padEnd(42)} R$ ${brl(f.vgv).padStart(11)} pct ${f.pct} → R$ ${brl(f.comissao)}`)
}
console.log(`\nCONFLITOS (HastaPro diz um, fechamento diz outro): ${conflitos.length}`)
for (const c of conflitos)
    console.log(`  ${c.data} ${c.leilao.slice(0, 38).padEnd(38)} lt ${c.lote.padStart(4)} R$ ${brl(c.vgv).padStart(11)} ${c.quem.padEnd(7)} ${c.situacao}${c.creditado_a ? ` → creditado a ${c.creditado_a}` : ''}`)
console.log(`\n→ ${OUT}/dados.json`)
