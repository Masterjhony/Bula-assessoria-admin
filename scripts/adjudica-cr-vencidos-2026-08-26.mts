/**
 * Adjudicacao dos CR vencidos — 26/08/2026, por ordem do Joao ("voce ja tem
 * contexto e fonte suficiente pra resolver por conta propria").
 *
 * Reguas, na ordem de forca:
 *   1. BANCO E O ARBITRO — entrada identificada no extrato decide.
 *   2. PLANILHA DA ANA e a fonte de cobranca (linha do MESMO evento, com NF e
 *      data) — se o evento consta RECEBIDO, a cobranca retroativa de 18/08 em
 *      cima dele e duplicata de estimativa e cai.
 *   3. DECISAO HUMANA DOCUMENTADA (conferencia Ana 15/07, decisao Bula 18/05)
 *      vence reativacao automatica por HastaPro — HastaPro NAO e lastro (e
 *      digitado dos grupos; regra de 25/08).
 *
 * O erro sistemico que isto corrige: o lote retroativo de 18/08 concluiu
 * "nunca foi faturado ao criador" olhando so o ERP — mas o faturamento de
 * jan-jun viveu na planilha/NFs, ANTES de o ERP registrar CR. Sete desses
 * eventos tem linha RECEBIDO com NF na planilha-mestra.
 *
 * Descoberta desta adjudicacao: 7.215,00 (NF 615, Terra Brava junho, tomador
 * EDUARDO PINHEIRO CAMPOS) = 3 x 2.405,00 EXATOS. O PIX de 2.405,00 de 25/08
 * e a 1a das 3 parcelas — resolve o "pagador misterioso" e derruba o CR
 * espelho criado na conciliacao da manha.
 *
 * Dry-run por padrao; --apply grava.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
const APPLY = process.argv.includes('--apply')
const f = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
let erros = 0
const fail = (e: { message: string } | null, ctx: string) => { if (e) { console.error('   ERRO ' + ctx + ': ' + e.message); erros++ } }

const T = '[ADJUDICACAO 26/08]'
type Acao =
    | { tipo: 'cancelar'; id: string; valor: number; rotulo: string; nota: string }
    | { tipo: 'receber'; id: string; valor: number; rotulo: string; data: string; nota: string }
    | { tipo: 'parcial'; id: string; valor: number; recebido: number; rotulo: string; data: string; nota: string }

const ACOES: Acao[] = [
    // ── retroativas de 18/08 sobre eventos que a planilha da como RECEBIDO com NF ──
    { tipo: 'cancelar', id: '7c720350', valor: 19401.60, rotulo: '10o EAO TOUROS 08/03 (retroativa)', nota: 'O evento FOI faturado e recebido: planilha-mestra tem LEILAO EAO - FEMEA 08/03 (12.386,74, NF 582 PAGO 30/04), EAO - MACHO 09/03 (9.239,01) e EAO - ASPIRACAO 09/03 (1.831,50), todos RECEBIDO. A retroativa estimou 8,6% em cima de evento ja liquidado.' },
    { tipo: 'cancelar', id: 'b739134f', valor: 8643.00, rotulo: '10o EAO BEZERRAS 09/03 (retroativa)', nota: 'Mesmo caso da retroativa do EAO TOUROS: evento faturado e recebido via NF 582 (planilha, PAGO 30/04). Duplicata de estimativa.' },
    { tipo: 'cancelar', id: '79fb8feb', valor: 33840.00, rotulo: '3o LS NEXT 15/03 (retroativa)', nota: 'Planilha: LS AGROPECUARIA 15/03 RECEBIDO 13.536,00 (NF 583, PAGO 15/05) — mesmo evento, e o CR d4551221 (13.536, recebido) ja existe. A retroativa estimou 10% (33.840) em cima de evento faturado por 13.536 e recebido.' },
    { tipo: 'cancelar', id: '81ac6f12', valor: 2965.00, rotulo: 'FB AGRO 02/04 (retroativa)', nota: 'Planilha: LEILAO FB AGRO 02/04 RECEBIDO (NF 590, PAGO 05/06). Evento ja liquidado.' },
    { tipo: 'cancelar', id: 'ccdd41ab', valor: 6360.00, rotulo: 'Matrizes de Vanguarda 09/04 (retroativa)', nota: 'Planilha: TOKA DO JACARE - VANGUARDA 09/04 RECEBIDO 15/06. Evento ja liquidado.' },
    { tipo: 'cancelar', id: '68e9949a', valor: 19290.00, rotulo: 'Nelore MRA 22/04 (retroativa)', nota: 'Planilha: LEILAO MRA 22/04 RECEBIDO 15/06. Evento ja liquidado.' },
    { tipo: 'cancelar', id: 'c61f5fb6', valor: 10140.00, rotulo: '2o LS Now 30/05 (retroativa)', nota: 'Planilha: LEILAO LS AGROPECUARIA 30/05 RECEBIDO 17.833,31 (NF 605) — CR 59f9672a recebido cobre. Conferencia Ana 15/07: "o LS real foi 30-31/05 e esta recebido".' },
    { tipo: 'cancelar', id: '7fee3918', valor: 5760.00, rotulo: '2o LS Collection 31/05 (retroativa)', nota: 'Planilha: LEILAO LS AGROPECUARIA 31/05 RECEBIDO 18.754,00 (NF 606). Conferencia Ana 15/07 confirma recebido.' },
    { tipo: 'cancelar', id: '096cf6e4', valor: 19950.00, rotulo: '18o Mega Nelore Para 30/05 (retroativa)', nota: 'Planilha: 18o MEGA RECEBIDO S/NF 22/06. O faturamento desse evento e POR COMPRADOR: Angico 3.870 (recebido) + Gustavo/Henrique 6.720 (aberto, NF 601). A retroativa de 19.950 (5% estimado) duplicaria o faturamento por comprador.' },
    { tipo: 'cancelar', id: '8bba5b4f'.replace('f', 'b'), valor: 8775.00, rotulo: 'Venda Touros RS 23/06 (retroativa)', nota: 'DUPLICATA EXATA: o CR c274fa7e (LEILAO RS AGROPECUARIA 23/06, 8.775,00) foi RECEBIDO em 05/08 via PIX de Roberto Bavaresco, conciliado no extrato. Mesma data de evento, mesmo valor.' },
    // ── reativacoes por HastaPro que contrariam decisao humana documentada ──
    { tipo: 'cancelar', id: 'a380a51b', valor: 3040.00, rotulo: 'Katayama Trilogia LT84 (reativada 27/07)', nota: 'Conferencia Ana 15/07: DUPLICIDADE — do Katayama Trilogia so ha 1.512 em NF (CR proprio, recebido). Reativacao de 27/07 veio do HastaPro, e HastaPro nao e lastro financeiro (regra de 25/08). A decisao humana documentada prevalece.' },
    { tipo: 'cancelar', id: '38a738fb', valor: 6756.00, rotulo: '1o Nelore Sao Francisco (reativada 27/07)', nota: 'Conferencia Ana 15/07: "nem dia de leilao nem vendas, nadica" — provisao sem lastro. Reativacao de 27/07 veio do HastaPro; HastaPro nao e lastro. Prevalece a conferencia.' },
    { tipo: 'cancelar', id: 'bfe42006', valor: 14340.00, rotulo: 'Cachoeirao / Perolas 14/04 (reativada 27/07)', nota: 'Decisao Bula de 18/05 registrada no proprio titulo: NAO COBRAR. Reativacao de 27/07 veio do HastaPro; HastaPro nao e lastro. Mesma regua dos demais: decisao humana documentada prevalece. Se a diretoria quiser cobrar, reabre-se com decisao nova.' },
    // ── banco decidiu ──
    { tipo: 'receber', id: 'f7487417', valor: 10164.00, rotulo: 'KIRZ 07/07 - Bula Remates', data: '2026-08-20', nota: 'Recebido no acerto de 20/08: transferencia de 19.810,50 da BULA REMATES com descricao literal "ACERTO BULA ASSESSORIA KRIZ E NELORACO". Rateio: Kirz integral (10.164,00) + Neloraco parcial (9.646,50).' },
    { tipo: 'parcial', id: '84700163', valor: 25155.00, recebido: 9646.50, rotulo: 'NELORACO PO 25/07 - Bula Remates', data: '2026-08-20', nota: 'Parcial do acerto de 20/08 (19.810,50, "ACERTO BULA ASSESSORIA KRIZ E NELORACO"): 19.810,50 − 10.164,00 do Kirz = 9.646,50 aqui. Restam 15.508,50 a cobrar da Bula Remates.' },
    { tipo: 'parcial', id: '19ac2940', valor: 7215.00, recebido: 2405.00, rotulo: 'Terra Brava JUNHO - NF 615 (Eduardo Pinheiro Campos)', data: '2026-08-25', nota: 'NF 615 de 7.215,00 = 3 parcelas EXATAS de 2.405,00. O PIX de 2.405,00 de EDUARDO PINHEIRO CAMPOS em 25/08 e a 1a parcela — identifica o pagador recorrente. Restam 2 parcelas (4.810,00).' },
]
const MOV_KRIZ_NELORACO = { data: '2026-08-20', valor: 19810.50 }
const MOV_EDUARDO = { data: '2026-08-25', valor: 2405.00 }
const CR_ESPELHO_EDUARDO = '55ce8e69-e426-4f7f-a016-d88c73783add'

/* ─── execucao ─── */
const resolve = async (prefixo: string) => {
    const { data } = await sb.from('erp_contas_receber').select('id,descricao,valor,valor_recebido,status,observacoes,origem').in('status', ['vencido', 'parcial', 'aberto'])
    return (data || []).find(c => String(c.id).startsWith(prefixo)) || null
}

let canceladoTotal = 0, recebidoTotal = 0
for (const a of ACOES) {
    const cr = await resolve(a.id)
    if (!cr) { console.log(`!! ${a.id} nao encontrado vivo — pulando (${a.rotulo})`); erros++; continue }
    if (Math.abs(Number(cr.valor) - a.valor) > 0.01) { console.log(`!! ${a.id} valor ${f(cr.valor)} != esperado ${f(a.valor)} — pulando`); erros++; continue }

    if (a.tipo === 'cancelar') {
        canceladoTotal += a.valor
        console.log(`CANCELAR ${f(a.valor).padStart(11)}  ${a.rotulo}`)
        if (APPLY) fail((await sb.from('erp_contas_receber').update({
            status: 'cancelado',
            observacoes: `${cr.observacoes || ''} ${T} CANCELADO: ${a.nota}`.trim(),
        }).eq('id', cr.id)).error, a.rotulo)
    } else if (a.tipo === 'receber') {
        recebidoTotal += a.valor
        console.log(`RECEBER  ${f(a.valor).padStart(11)}  ${a.rotulo}  (${a.data})`)
        if (APPLY) fail((await sb.from('erp_contas_receber').update({
            status: 'recebido', valor_recebido: a.valor, data_recebimento: a.data, forma_recebimento: 'transferencia',
            observacoes: `${cr.observacoes || ''} ${T} ${a.nota}`.trim(),
        }).eq('id', cr.id)).error, a.rotulo)
    } else {
        recebidoTotal += a.recebido
        console.log(`PARCIAL  ${f(a.recebido).padStart(11)} de ${f(a.valor)}  ${a.rotulo}  (${a.data})`)
        if (APPLY) fail((await sb.from('erp_contas_receber').update({
            status: 'parcial', valor_recebido: a.recebido, forma_recebimento: 'pix',
            origem: 'real', // Terra Brava era estimativa; com NF emitida e parcela paga, e real
            observacoes: `${cr.observacoes || ''} ${T} ${a.nota}`.trim(),
        }).eq('id', cr.id)).error, a.rotulo)
    }
}

/* espelho do Eduardo cai (o PIX agora pertence a NF 615) */
console.log(`\nCANCELAR espelho 2.405,00 do Eduardo (55ce8e69) — o PIX e a 1a parcela da NF 615, nao receita avulsa`)
if (APPLY) fail((await sb.from('erp_contas_receber').update({
    status: 'cancelado', valor_recebido: 0, data_recebimento: null,
    observacoes: `${T} CANCELADO: este espelho foi criado na conciliacao da manha quando o leilao de origem do PIX era desconhecido. Identificado: 7.215,00 (NF 615 Terra Brava junho) = 3 x 2.405,00 exatos — o PIX e a 1a parcela e foi aplicado como parcial no CR 19ac2940.`,
}).eq('id', CR_ESPELHO_EDUARDO)).error, 'espelho Eduardo')

/* religa os movimentos aos titulos certos e concilia o acerto Kriz/Neloraco */
console.log('Religando movimentos: PIX 2.405 -> CR Terra Brava; acerto 19.810,50 -> conciliado')
if (APPLY) {
    const { data: mEd } = await sb.from('erp_movimentos_bancarios').select('id,observacoes').eq('data', MOV_EDUARDO.data).eq('valor', MOV_EDUARDO.valor).eq('tipo', 'entrada')
    if (mEd?.[0]) fail((await sb.from('erp_movimentos_bancarios').update({
        conta_receber_id: (await resolve('19ac2940'))?.id ?? null,
        observacoes: `${mEd[0].observacoes || ''} ${T} Religado ao CR 19ac2940 (Terra Brava junho, NF 615): 7.215 = 3 x 2.405; este PIX e a 1a parcela.`.trim(),
    }).eq('id', mEd[0].id)).error, 'mov Eduardo')
    const { data: mKr } = await sb.from('erp_movimentos_bancarios').select('id,observacoes').eq('data', MOV_KRIZ_NELORACO.data).eq('valor', MOV_KRIZ_NELORACO.valor).eq('tipo', 'entrada')
    if (mKr?.[0]) fail((await sb.from('erp_movimentos_bancarios').update({
        status_conciliacao: 'conciliado', conciliado: true,
        observacoes: `${mKr[0].observacoes || ''} ${T} Rateio resolvido: Kirz 10.164,00 integral + Neloraco 9.646,50 parcial (descricao do proprio credito: "ACERTO BULA ASSESSORIA KRIZ E NELORACO"). Neloraco segue com 15.508,50 a cobrar.`.trim(),
    }).eq('id', mKr[0].id)).error, 'mov Kriz/Neloraco')
}

console.log(`\nTOTAL cancelado ${f(canceladoTotal)} · baixado ${f(recebidoTotal)}`)
console.log(APPLY ? (erros ? `*** ${erros} erro(s) ***` : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.')
