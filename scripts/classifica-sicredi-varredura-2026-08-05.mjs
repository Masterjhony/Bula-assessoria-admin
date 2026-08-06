// Sicredi 53609-7 e conta VARREDURA: todo credito e varrido para a aplicacao e
// todo pagamento e coberto por um resgate automatico. Os movimentos
// APLICACAO/RESG.APLIC sao INTERNOS (tipo=transferencia, fora do resultado),
// mas apareciam na conciliacao como "— definir —", parecendo credito nao
// identificado (gargalo apontado pelo Joao Eduardo em 05/08).
//
// Este script:
//  1) cria a pessoa "SICREDI - Aplicacao (varredura automatica)" e atribui a
//     TODOS os movimentos APLICACAO/RESG da conta (a tela passa a mostrar o
//     "responsavel" em vez de "— definir —");
//  2) normaliza a categoria pelo texto (RESG -> Resgate Aplicacao Financeira;
//     APLICACAO -> Aplicacao Financeira) e marca conciliado;
//  3) quando o resgate cobre exatamente a(s) saida(s) do dia, anota isso na
//     observacao (rastreabilidade);
//  4) corrige 2 entradas reais rotuladas como "Outras Receitas"
//     (Claudio Sabino 4.050 de 03/07 -> Recebimento Cliente; Bula Remates 120
//     de 09/07 -> Comissoes Recebidas);
//  5) confere que NENHUM movimento tipo entrada/saida (que conta no resultado)
//     usa categoria de aplicacao/resgate — se houver, lista para revisao.
// Idempotente. DRY_RUN=1 simula.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100
const now = () => new Date().toISOString()
const MARK = '[SICREDI-VARREDURA 05/08]'
const SICREDI = 'af4724ec-e098-4e13-b172-04b2bfb1949d'
const CAT_RESGATE = '67fbaf99-9539-4433-936a-d8f499363a34'
const CAT_APLICACAO = 'e7198fb9-acfc-4b22-a738-dcf72000dd31'
const CAT_RECEB_CLIENTE = 'ee101d8d-4c90-4cbc-8139-a156e046e20f'
const CAT_COMISSOES = '0153d30c-e167-40c6-9c5a-2605bd39dc6e'

console.log(DRY_RUN ? '*** DRY RUN ***\n' : '*** GRAVANDO ***\n')

// pessoa da varredura
let varredura
{
  const { data: hit } = await sb.from('erp_pessoas').select('id,nome').ilike('nome', '%SICREDI%Aplicacao%').maybeSingle()
  if (hit) varredura = hit
  else if (DRY_RUN) { varredura = { id: null, nome: 'SICREDI - Aplicacao (varredura automatica)' }; console.log('[+] pessoa nova (dry):', varredura.nome) }
  else {
    const { data, error } = await sb.from('erp_pessoas').insert({
      tipo: 'pj', nome: 'SICREDI - Aplicacao (varredura automatica)', razao_social: 'SICREDI UNIAO MS/TO - CONTA APLICACAO',
      is_cliente: false, is_fornecedor: false, ativo: true,
      observacoes: `${MARK} Entidade interna: aplicacao vinculada a CC 53609-7 (varredura). Movimentos APLICACAO/RESG sao internos, nao afetam o resultado.`,
    }).select('id,nome').single()
    if (error) throw error
    varredura = data
    console.log('[+] pessoa nova:', data.nome)
  }
}

const movs = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('erp_movimentos_bancarios')
    .select('id,data,tipo,valor,descricao,categoria_id,pessoa_id,status_conciliacao,observacoes')
    .eq('conta_bancaria_id', SICREDI).order('data').range(from, from + 999)
  if (error) throw error
  movs.push(...data)
  if (data.length < 1000) break
}

const isResg = (m) => /RESG\.?APLIC/i.test(m.descricao || '')
const isAplic = (m) => /^APLICACAO FINANCEIRA/i.test(m.descricao || '') || /AJUSTE POSICAO APLICACAO/i.test(m.descricao || '')
const sweeps = movs.filter((m) => isResg(m) || isAplic(m))
console.log(`movimentos de varredura: ${sweeps.length} de ${movs.length}`)

// saidas por dia para anotar cobertura dos resgates
const saidasPorDia = new Map()
for (const m of movs) {
  if (m.tipo !== 'saida' && !(m.tipo === 'transferencia' && /PAGAMENTO PIX|TRANSF/i.test(m.descricao || '') && !isResg(m) && !isAplic(m))) continue
  if (!saidasPorDia.has(m.data)) saidasPorDia.set(m.data, 0)
  saidasPorDia.set(m.data, r2(saidasPorDia.get(m.data) + Number(m.valor)))
}
const resgPorDia = new Map()
for (const m of sweeps) {
  if (!isResg(m)) continue
  resgPorDia.set(m.data, r2((resgPorDia.get(m.data) || 0) + Number(m.valor)))
}

let n = 0
for (const m of sweeps) {
  const alvoCat = isResg(m) ? CAT_RESGATE : CAT_APLICACAO
  const precisaCat = m.categoria_id !== alvoCat
  const precisaPessoa = m.pessoa_id !== varredura.id
  const precisaStatus = m.status_conciliacao !== 'conciliado'
  if (!precisaCat && !precisaPessoa && !precisaStatus) continue
  const cobre = isResg(m) && saidasPorDia.has(m.data) && Math.abs((resgPorDia.get(m.data) || 0) - saidasPorDia.get(m.data)) < 1
  const nota = isResg(m)
    ? `Varredura automatica: resgate da aplicacao para cobrir pagamentos do dia${cobre ? ` (resgates do dia = saidas do dia, ${brl(saidasPorDia.get(m.data))})` : ''}. Movimento interno — nao e receita.`
    : 'Varredura automatica: credito do dia aplicado. Movimento interno — nao e despesa.'
  if (DRY_RUN) { console.log(`[~] ${m.data} ${brl(m.valor).padStart(12)} ${String(m.descricao).slice(0, 40)} => pessoa varredura${precisaCat ? ', categoria' : ''}`); n++; continue }
  const { error } = await sb.from('erp_movimentos_bancarios').update({
    pessoa_id: varredura.id, categoria_id: alvoCat, status_conciliacao: 'conciliado', conciliado: true,
    observacoes: `${m.observacoes ? m.observacoes + ' ' : ''}${MARK} ${nota}`, updated_at: now(),
  }).eq('id', m.id)
  if (error) throw error
  n++
}
console.log(`${DRY_RUN ? 'Simulados' : 'Gravados'} ${n} movimentos de varredura.`)

// 4) entradas reais com categoria errada
const fixes = [
  { data: '2026-07-03', valor: 4050, cat: CAT_RECEB_CLIENTE, motivo: 'Recebimento de cliente (Claudio Sabino), nao "Outras Receitas".' },
  { data: '2026-07-09', valor: 120, cat: CAT_COMISSOES, motivo: 'Credito Bula Remates = comissao recebida.' },
]
for (const f of fixes) {
  const m = movs.find((x) => x.data === f.data && r2(x.valor) === f.valor && x.tipo === 'entrada')
  if (!m) { console.log(`[!] nao achei entrada ${f.data} ${brl(f.valor)}`); continue }
  if (m.categoria_id === f.cat) { console.log(`[=] ${f.data} ${brl(f.valor)} ja correto`); continue }
  console.log(`[~] ${f.data} ${brl(f.valor)} => categoria corrigida`)
  if (!DRY_RUN) {
    const { error } = await sb.from('erp_movimentos_bancarios').update({
      categoria_id: f.cat, observacoes: `${m.observacoes ? m.observacoes + ' ' : ''}${MARK} ${f.motivo}`, updated_at: now(),
    }).eq('id', m.id)
    if (error) throw error
  }
}

// 5) sanidade: entrada/saida com categoria de aplicacao/resgate em QUALQUER conta
const { data: susp } = await sb.from('erp_movimentos_bancarios')
  .select('data,tipo,valor,descricao, conta:erp_contas_bancarias(nome)')
  .in('categoria_id', [CAT_RESGATE, CAT_APLICACAO]).in('tipo', ['entrada', 'saida'])
console.log(`\nSanidade — entrada/saida (contam no resultado) com categoria de aplicacao/resgate: ${susp?.length || 0}`)
for (const m of susp || []) console.log(`  [!] ${m.data} | ${m.tipo} | ${brl(m.valor)} | ${m.conta?.nome} | ${String(m.descricao).slice(0, 55)}`)
