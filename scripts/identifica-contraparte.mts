/**
 * Backfill de "quem está do outro lado" na Conciliação.
 *
 * A tela mostra "— definir —" (ou só o memo do extrato, em itálico) quando o
 * movimento não tem `pessoa_id`. Este script preenche o que dá para preencher
 * com evidência, e LISTA o que não dá — nome nenhum é inventado.
 *
 * Ordem das regras:
 *   1. `identificaContraparte` (src/lib/erp-contraparte) — documento no
 *      histórico, CPF mascarado, padrão de banco/tributo, favorecido declarado.
 *      É a MESMA função que o importador usa, para o que entra novo já nascer
 *      identificado.
 *   2. pessoa do título vinculado (CP.fornecedor_id / CR.cliente_id).
 *   3. título irmão: a parcela (2/3) herda o cliente das parcelas (1/3) e (3/3).
 *   4. tabela `REVISADOS`: os casos que só o histórico do ERP resolve
 *      (contador, multa, hotel já cadastrado…). Cada linha tem a evidência que
 *      a sustenta escrita ao lado — se você não concorda com uma, apague.
 *
 * Quando o movimento é identificado e o título vinculado está sem
 * fornecedor/cliente, o título também recebe a pessoa: é o mesmo fato.
 *
 * Uso:
 *   npx tsx scripts/identifica-contraparte.mts            (dry-run, não grava)
 *   npx tsx scripts/identifica-contraparte.mts --apply
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { identificaContraparte, normaliza, type PessoaCadastro } from '../src/lib/erp-contraparte'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))

const APPLY = process.argv.includes('--apply')
const sb: SupabaseClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
})

const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function todos<T>(tabela: string, select: string, filtro: (q: any) => any = (q) => q): Promise<T[]> {
    const out: T[] = []
    for (let de = 0; ; de += 1000) {
        const { data, error } = await filtro(sb.from(tabela).select(select)).range(de, de + 999)
        if (error) throw new Error(`${tabela}: ${error.message}`)
        out.push(...(data as T[] ?? []))
        if (!data || data.length < 1000) break
    }
    return out
}

/**
 * Pessoas que faltavam no cadastro. Os dados vêm da consulta ao CNPJ na
 * BrasilAPI (feita em 09/09/2026); estão fixos aqui para o script não depender
 * de rede nem repetir a consulta.
 */
const NOVAS_PESSOAS: Array<{ nome: string; razao_social: string; documento: string; tipo: 'pj' | 'pf'; cidade?: string; uf?: string; observacoes: string }> = [
    {
        nome: 'PRIVATE LABEL SERVICOS TEXTEIS', razao_social: 'PRIVATE LABEL SERVICOS TEXTEIS LTDA',
        documento: '68.392.671/0001-89', tipo: 'pj', cidade: 'Uberaba', uf: 'MG',
        observacoes: 'Uniformes da equipe (Expogenética 2026). CNPJ lido do próprio histórico do extrato.',
    },
    {
        nome: 'CLINICA DA ALMA MS', razao_social: 'ASSOCIACAO DE APOIO SOCIAL CLINICA DA ALMA MS',
        documento: '12.335.532/0001-69', tipo: 'pj', cidade: 'Campo Grande', uf: 'MS',
        observacoes: 'Identificada pelo CNPJ do PIX de 04/09/2026 (R$ 20,00). Motivo do pagamento a confirmar.',
    },
    {
        nome: 'Marcelo de Oliveira do Carmo', razao_social: '', documento: '***.037.836-**', tipo: 'pf',
        observacoes: 'Motorista do transfer do aeroporto de Confins (Marcelo Carneiro, 29/07/2026). Nome vem da descrição do próprio título no ERP; CPF só mascarado no extrato.',
    },
]

/**
 * Casos que o histórico do ERP resolve, mas nenhuma regra genérica pega.
 * `re` casa contra "descricao | observacoes".
 */
const REVISADOS: Array<{ re: RegExp; pessoa: string; porque: string }> = [
    { re: /CONTADOR|HONORARIOS DE CONTABILIDADE/i, pessoa: 'LUCAS MONTEIRO 35690154830', porque: 'os três pagamentos de R$ 1.058,00 de "Contabilidade" (02/02, 02/03, 05/06) são deste fornecedor' },
    { re: /MULTA\s+UNIDAS/i, pessoa: 'UNIDAS LOCADORA SA', porque: 'multa de locação da Unidas, já cadastrada' },
    { re: /CLICK\s?WEB/i, pessoa: 'CLICKWEB SERVICOS DE INFORMATICA INTERNET LTDA', porque: 'mesmo boleto de R$ 218,30 do site bulaassessoria.com pago em 06/07' },
    { re: /\bREMAT\b|DEFERIMENTO\s+MARCAS/i, pessoa: 'REMAT MARCAS E PATENTES', porque: 'deferimento de marcas — fornecedor cadastrado' },
    // "Matheus M1" é o apelido do Matheus Eberts (mapa de pessoas da casa); das
    // duas fichas que existem para ele, fica a que tem CPF — a "MATHEUS M1" é
    // stub da folha, sem documento.
    { re: /DIARIAS?\s+MATHEUS\s+M1/i, pessoa: 'Matheus Henrique Eberts Verdi', porque: 'Matheus M1 = Matheus Eberts; as diárias de jan a jun foram todas para esta ficha' },
]

type Mov = {
    id: string; data: string; tipo: string; valor: number; descricao: string | null; observacoes: string | null
    documento: string | null; pessoa_id: string | null; conta_pagar_id: string | null; conta_receber_id: string | null
    conta_bancaria_id: string
}
type Titulo = { id: string; descricao: string | null; fornecedor_id?: string | null; cliente_id?: string | null }

const pessoas = await todos<PessoaCadastro & { tipo?: string }>('erp_pessoas', 'id,nome,razao_social,documento,tipo')
const movs = await todos<Mov>('erp_movimentos_bancarios', 'id,data,tipo,valor,descricao,observacoes,documento,pessoa_id,conta_pagar_id,conta_receber_id,conta_bancaria_id', q => q.is('pessoa_id', null).order('data'))
const cps = await todos<Titulo>('erp_contas_pagar', 'id,descricao,fornecedor_id')
const crs = await todos<Titulo>('erp_contas_receber', 'id,descricao,cliente_id')
const contas = await todos<{ id: string; nome: string }>('erp_contas_bancarias', 'id,nome')

const nomeConta = new Map(contas.map(c => [c.id, c.nome]))
const cpPorId = new Map(cps.map(t => [t.id, t]))
const crPorId = new Map(crs.map(t => [t.id, t]))
const pessoaPorId = new Map(pessoas.map(p => [p.id, p]))

console.log(`${movs.length} movimento(s) sem contraparte.  Modo: ${APPLY ? 'GRAVANDO' : 'dry-run'}\n`)

// ── cadastro das pessoas que faltavam ───────────────────────────────────────
for (const nova of NOVAS_PESSOAS) {
    const digitos = nova.documento.replace(/[^\d*]/g, '')
    const existe = pessoas.find(p => String(p.documento ?? '').replace(/[^\d*]/g, '') === digitos && digitos.length > 0)
        || pessoas.find(p => normaliza(p.nome) === normaliza(nova.nome))
    if (existe) continue
    if (!APPLY) {
        console.log(`+ pessoa (a criar): ${nova.nome} — ${nova.documento}`)
        pessoas.push({ id: `novo:${nova.nome}`, nome: nova.nome, razao_social: nova.razao_social, documento: nova.documento })
        continue
    }
    const { data, error } = await sb.from('erp_pessoas').insert({
        tipo: nova.tipo, nome: nova.nome, razao_social: nova.razao_social, documento: nova.documento,
        cidade: nova.cidade ?? '', uf: nova.uf ?? '', is_fornecedor: true,
        observacoes: nova.observacoes,
    }).select('id,nome,razao_social,documento').single()
    if (error) throw new Error(`criar pessoa ${nova.nome}: ${error.message}`)
    console.log(`+ pessoa criada: ${data!.nome} — ${nova.documento}`)
    pessoas.push(data as PessoaCadastro)
}

// ── resolução ───────────────────────────────────────────────────────────────
type Decisao = { mov: Mov; pessoa_id: string; nome: string; regra: string; evidencia: string }
const decisoes: Decisao[] = []
const semDono: Mov[] = []

const chaveIrma = (d: string | null) => normaliza(d).replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, '').replace(/\s+/g, ' ').trim()
const irmaosCR = new Map<string, string>()
for (const t of crs) { if (t.cliente_id) irmaosCR.set(chaveIrma(t.descricao), t.cliente_id) }
const irmaosCP = new Map<string, string>()
for (const t of cps) { if (t.fornecedor_id) irmaosCP.set(chaveIrma(t.descricao), t.fornecedor_id) }

for (const m of movs) {
    // 1. regras genéricas (as mesmas do importador)
    const achou = identificaContraparte(m, pessoas)
    if (achou) { decisoes.push({ mov: m, pessoa_id: achou.pessoa_id, nome: achou.nome, regra: achou.regra, evidencia: achou.evidencia }); continue }

    // 2. pessoa do título vinculado
    const tit = m.conta_pagar_id ? cpPorId.get(m.conta_pagar_id) : m.conta_receber_id ? crPorId.get(m.conta_receber_id) : null
    const doTitulo = tit ? (tit.fornecedor_id || tit.cliente_id) : null
    if (doTitulo && pessoaPorId.has(doTitulo)) {
        decisoes.push({ mov: m, pessoa_id: doTitulo, nome: pessoaPorId.get(doTitulo)!.nome, regra: 'titulo', evidencia: `título "${tit!.descricao}"` })
        continue
    }

    // 3. título irmão (outras parcelas do mesmo acordo)
    if (tit) {
        const irmao = m.conta_receber_id ? irmaosCR.get(chaveIrma(tit.descricao)) : irmaosCP.get(chaveIrma(tit.descricao))
        if (irmao && pessoaPorId.has(irmao)) {
            decisoes.push({ mov: m, pessoa_id: irmao, nome: pessoaPorId.get(irmao)!.nome, regra: 'titulo-irmao', evidencia: `outras parcelas de "${tit.descricao}"` })
            continue
        }
    }

    // 4. casos revisados à mão
    const texto = `${m.descricao ?? ''} | ${m.observacoes ?? ''}`
    const revisado = REVISADOS.find(r => r.re.test(texto))
    if (revisado) {
        const p = pessoas.find(x => normaliza(x.nome) === normaliza(revisado.pessoa))
        if (p) { decisoes.push({ mov: m, pessoa_id: p.id, nome: p.nome, regra: 'revisado', evidencia: revisado.porque }); continue }
        console.log(`! pessoa "${revisado.pessoa}" não está no cadastro (regra revisada)`)
    }

    semDono.push(m)
}

// ── gravação ────────────────────────────────────────────────────────────────
let titulosAtualizados = 0
for (const d of decisoes) {
    const m = d.mov
    console.log(`${m.data} ${(m.tipo === 'entrada' ? '+' : '-')}${brl(m.valor).padStart(12)}  ${d.nome.padEnd(46).slice(0, 46)}  [${d.regra}] ${d.evidencia}`)
    if (!APPLY) continue
    if (d.pessoa_id.startsWith('novo:')) continue
    const { error } = await sb.from('erp_movimentos_bancarios').update({ pessoa_id: d.pessoa_id, updated_at: new Date().toISOString() }).eq('id', m.id)
    if (error) throw new Error(`movimento ${m.id}: ${error.message}`)

    // o título vinculado guarda o mesmo fato — se está sem dono, recebe o mesmo
    if (m.conta_pagar_id) {
        const t = cpPorId.get(m.conta_pagar_id)
        if (t && !t.fornecedor_id) {
            const { error: e2 } = await sb.from('erp_contas_pagar').update({ fornecedor_id: d.pessoa_id }).eq('id', t.id)
            if (e2) throw new Error(`título CP ${t.id}: ${e2.message}`)
            t.fornecedor_id = d.pessoa_id; titulosAtualizados++
        }
    } else if (m.conta_receber_id) {
        const t = crPorId.get(m.conta_receber_id)
        if (t && !t.cliente_id) {
            const { error: e2 } = await sb.from('erp_contas_receber').update({ cliente_id: d.pessoa_id }).eq('id', t.id)
            if (e2) throw new Error(`título CR ${t.id}: ${e2.message}`)
            t.cliente_id = d.pessoa_id; titulosAtualizados++
        }
    }
}

console.log(`\n${decisoes.length} identificado(s)${APPLY ? `, ${titulosAtualizados} título(s) também` : ''}.`)

if (semDono.length) {
    console.log(`\n── ${semDono.length} continuam sem dono (precisam de confirmação humana) ──`)
    for (const m of semDono) {
        console.log(`  ${m.data} ${(m.tipo === 'entrada' ? '+' : '-')}${brl(m.valor).padStart(12)}  ${nomeConta.get(m.conta_bancaria_id) ?? ''}`)
        console.log(`      ${m.descricao ?? ''}`)
    }
}
