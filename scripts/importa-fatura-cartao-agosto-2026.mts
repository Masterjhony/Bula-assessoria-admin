/**
 * Fecha as faturas de AGOSTO/2026 dos dois cartoes Sicoob no ERP.
 *
 * Fonte: Sicoob IB > Cartoes > Meus cartoes > Extrato detalhado > Emitir
 * (vencimento 22/08/2026), lido em 26/08/2026 e salvo cru em
 * outputs/cartoes-agosto-2026/faturas-agosto-2026.json.
 *
 * Ate aqui `erp_cartao_faturas` ia so ate 2026-07 — a fatura de agosto ja tinha
 * sido DEBITADA no extrato (24/08: VISA 5.949,84 + MASTERCARD 1.380,13) sem
 * nunca ter virado fatura no ERP. Este script fecha esse buraco.
 *
 * O modulo de cartoes e ANALITICO: o desembolso ja vive em
 * `erp_movimentos_bancarios` e a fatura so REFERENCIA esse movimento
 * (`movimento_id`). Nada de fluxo novo, nada de dupla contagem.
 *
 * Validacao que o script exige antes de gravar (a mesma da importacao de
 * jan-jun): Σ(lancamentos com sinal) == total_fatura − saldo_anterior.
 *
 * Os 21 lancamentos entram DISCRIMINADOS e categorizados por estabelecimento —
 * era esse o pedido: nada de "Outras Despesas Cartao" como saco de gato.
 *
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100

/* ---- categorias de analise (as que ja existem no ERP) --------------------- */
const CAT = {
    viagem: '98083139-0fbf-487a-9988-a08519ebf259',      // Viagem/Passagens (custo_direto)
    assinatura: '0edf60f2-bf96-44bd-8f93-ca5432b69830',  // Software/Assinaturas (despesa_fixa)
    informatica: 'b4f8b814-1a95-433e-ae1e-4fb3896e5f40', // Informatica/Eletronicos (despesa_variavel)
    compras: '1d16d458-64a3-4e01-b47e-83793bf077e5',     // Compras Diversas (despesa_variavel)
    seguroCartao: '732c63ed-1c36-4eda-b1e6-b285b81e533a',// Seguro Cartao (financeiro)
    pagamento: 'b6bfa157-c266-4071-a461-039d712bb99e',   // Pagamento Fatura (financeiro)
}

/**
 * Estabelecimento -> categoria. A coluna `perfil` guarda como o proprio Sicoob
 * classificou, para dar pra auditar quando as duas leituras divergem (Casas
 * Bahia entrou como "supermercado" no perfil deles, por exemplo).
 */
const REGRAS: { re: RegExp; cat: string; perfil: string }[] = [
    { re: /AZUL|GOL |LATAM|HOTEL/i, cat: CAT.viagem, perfil: 'ESPORTES LAZER E TURISMO' },
    { re: /GLOBO|COMBOVITALICIO/i, cat: CAT.assinatura, perfil: 'EDUCACAO E CULTURA / ARTIGOS P/ O LAR' },
    { re: /SEEGMA|MP\*MERCADOLIVRE/i, cat: CAT.informatica, perfil: 'INFORMATICA' },
    { re: /MERCADOLIVRE|R IMPORTS/i, cat: CAT.compras, perfil: 'PRESENTES, MKT DIRETO, CATALOG' },
    { re: /CASASBAHIA/i, cat: CAT.compras, perfil: 'SUPERMERCADO E HIPERMERCADO (classificacao do Sicoob)' },
]
const categoriza = (desc: string, tipo: string) => {
    if (tipo === 'seguro') return { cat: CAT.seguroCartao, perfil: 'seguro do cartao' }
    if (tipo === 'pagamento') return { cat: CAT.pagamento, perfil: 'liquidacao da fatura anterior' }
    const r = REGRAS.find(x => x.re.test(desc))
    if (!r) throw new Error(`sem regra de categoria para "${desc}" — nao vou jogar em "Outras Despesas Cartao"`)
    return { cat: r.cat, perfil: r.perfil }
}

const dados = JSON.parse(fs.readFileSync('outputs/cartoes-agosto-2026/faturas-agosto-2026.json', 'utf8'))
let erros = 0

for (const f of dados.faturas) {
    console.log('\n' + '='.repeat(78))
    console.log(`${f.bandeira} ${f.final}  ·  conta ${f.conta_cartao}  ·  competencia ${f.competencia}`)
    console.log('='.repeat(78))

    const { data: cartao } = await sb.from('erp_cartoes').select('id,apelido').eq('conta_cartao', f.conta_cartao).single()
    if (!cartao) { console.error('  cartao nao cadastrado'); erros++; continue }

    // ---- validacao ANTES de qualquer escrita -------------------------------
    const lancs = f.movimentos.filter((m: { tipo: string }) => m.tipo !== 'saldo_anterior')
    const soma = r2(lancs.reduce((s: number, m: { valor: number }) => s + m.valor, 0))
    const esperado = r2(f.total_fatura - f.saldo_anterior)
    console.log(`  Σ lancamentos ${brl(soma)}  ==  total − saldo anterior ${brl(esperado)}  ${soma === esperado ? 'OK' : '*** DIVERGE ***'}`)
    if (soma !== esperado) { erros++; continue }

    const compras = r2(lancs.filter((m: { tipo: string }) => m.tipo === 'compra').reduce((s: number, m: { valor: number }) => s + m.valor, 0))
    const encargos = r2(lancs.filter((m: { tipo: string }) => ['seguro', 'encargo', 'anuidade'].includes(m.tipo)).reduce((s: number, m: { valor: number }) => s + m.valor, 0))
    console.log(`  debitos ${brl(compras)} (declarado ${brl(f.debitos)})  ·  encargos ${brl(encargos)} (declarado ${brl(f.encargos)})`)
    if (compras !== r2(f.debitos) || encargos !== r2(f.encargos)) { console.error('  *** campos declarados nao batem com os lancamentos ***'); erros++; continue }

    // ---- o movimento bancario que pagou (ja existe no extrato) --------------
    const { data: movs } = await sb.from('erp_movimentos_bancarios')
        .select('id,data,valor,descricao')
        .eq('data', f.data_pagamento).eq('tipo', 'saida')
    const mov = (movs || []).find(m => r2(Number(m.valor)) === r2(f.total_fatura))
    console.log(`  movimento do pagamento (${f.data_pagamento}, ${brl(f.total_fatura)}): ${mov ? mov.id : 'NAO ACHEI'}`)
    if (!mov) { erros++; continue }

    // ---- fatura ------------------------------------------------------------
    const doc = `CARTAO-${f.conta_cartao}-${f.competencia}`
    const { data: ja } = await sb.from('erp_cartao_faturas')
        .select('id').eq('cartao_id', cartao.id).eq('competencia', f.competencia).maybeSingle()
    if (ja) { console.log(`  fatura ja existe (${ja.id}) — nada a fazer`); continue }

    console.log(`  + fatura ${f.competencia}: saldo ant ${brl(f.saldo_anterior)} | deb ${brl(compras)} | enc ${brl(encargos)} | pgto ${brl(f.pagamento)} | TOTAL ${brl(f.total_fatura)}`)
    let faturaId: string | null = null
    if (APPLY) {
        const { data, error } = await sb.from('erp_cartao_faturas').insert({
            cartao_id: cartao.id, competencia: f.competencia, mes_nome: 'AGOSTO',
            saldo_anterior: f.saldo_anterior, debitos: compras, encargos, pagamentos: f.pagamento,
            total_fatura: f.total_fatura, pagamento_minimo: f.pagamento_minimo,
            data_fechamento: f.fechamento, data_vencimento: f.vencimento, data_pagamento: f.data_pagamento,
            valor_pago: f.total_fatura, status: 'paga', movimento_id: mov.id,
            origem: 'internet_banking_2026_08_26', documento: doc,
            observacoes: `Fatura AGOSTO ${f.competencia} lida no Sicoob IB em 26/08/2026 (Extrato detalhado > Emitir, venc 22/08/2026). Proxima fatura ${brl(f.proxima_fatura)}; divida consolidada ${brl(f.divida_consolidada)}. 100% das compras sao GASTOS DE FELIPE V ANDRADE.`,
        }).select('id').single()
        if (error) { console.error('  ERRO fatura: ' + error.message); erros++; continue }
        faturaId = data.id
    }

    // ---- lancamentos discriminados -----------------------------------------
    console.log(`  + ${lancs.length} lancamentos:`)
    const payload = lancs.map((m: Record<string, string | number | null>, i: number) => {
        const { cat, perfil } = categoriza(String(m.descricao), String(m.tipo))
        console.log(`      ${String(m.data_compra || '  -  ').padEnd(6)} ${brl(Number(m.valor)).padStart(11)}  ${String(m.descricao).slice(0, 40).padEnd(42)} ${perfil}`)
        return {
            fatura_id: faturaId, cartao_id: cartao.id,
            data_compra: m.data_compra || '', descricao: m.descricao,
            portador: m.portador || 'CONTA', portador_final: m.portador_final || '',
            parcela: m.parcela || '', valor: m.valor, tipo: m.tipo, categoria_id: cat,
            documento: `${doc}-${String(i + 1).padStart(3, '0')}`,
            observacoes: `Perfil de consumo Sicoob: ${perfil}.`,
        }
    })
    if (APPLY && faturaId) {
        const { error } = await sb.from('erp_cartao_lancamentos').insert(payload)
        if (error) { console.error('  ERRO lancamentos: ' + error.message); erros++ }
    }
}

console.log('\n' + (APPLY ? (erros ? `*** ${erros} erro(s) ***` : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.'))
