// Classifica os movimentos bancarios de agosto/2026 usando a DESCRICAO da
// transacao como verdade (regra do chefe: "a descricao eu coloquei certinho").
// Grava backup antes. Nao mexe em nada que ja tenha categoria.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const fmt = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const APLICAR = process.argv.includes('--aplicar')

// descricao -> categoria (a ordem importa: primeira regra que casar vence)
const REGRAS = [
  [/00\.?360\.?305/, 'Encargos Sociais', 'CNPJ da Caixa = guia FGTS (bate com o titulo GUIA FGTS do HastaPro)'],
  [/mesma tit|mesma titularidade/i, null, 'transferencia entre contas proprias'],
  [/contador/i, 'Servicos de Terceiros', ''],
  [/reembolso/i, 'REEMBOLSO', ''],
  [/tr[aá]fego pago|marketing|campanha/i, 'Marketing e Publicidade', ''],
  [/uber/i, 'Transporte (Apps)', ''],
  [/tarifa|pacote servicos/i, 'Tarifas Bancarias', ''],
  [/subsc\.?\/integr|integraliza/i, 'Integralizacao Capital Cooperativa', ''],
  [/clickweb|click web/i, 'Software/Assinaturas', ''],
  [/aluguel/i, 'Aluguel', ''],
  [/estadia|di[aá]ria hotel|hotel/i, 'Viagem/Passagens', ''],
  [/di[aá]rias/i, 'Viagem/Passagens', ''],
  [/rusa/i, 'Repasse Assessorias/Parceiros', 'Rusa e parceiro 5%'],
  [/comiss[aã]o/i, 'Comissão Funcionário', ''],
  [/sal[aá]rio|folha/i, 'Folha de Pagamento', ''],
  [/jbj|agropecuaria ltda.*15\.?689\.?716/i, 'Comissao Leilao', 'recebimento JMP'],
  [/aplicacao/i, 'Aplicacao Financeira', ''],
]
// entradas que sao recebimento de leilao
const REGRAS_ENTRADA = [
  [/jbj|bula remates|bavaresco|spaggiari/i, 'Comissao Leilao', ''],
  [/mesma tit/i, 'Transferencias Internas - Entrada', ''],
  [/devolucao/i, 'Outras Receitas', ''],
]

const { data: cats } = await sb.from('erp_categorias').select('id,nome,tipo').limit(200)
const idDe = Object.fromEntries((cats || []).map((c) => [c.nome, c.id]))
const nomeDe = Object.fromEntries((cats || []).map((c) => [c.id, c.nome]))

const { data: mov } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,tipo,descricao,valor,categoria_id,status_conciliacao')
  .gte('data', '2026-08-01').lte('data', '2026-08-31').order('data')

writeFileSync('outputs/backup-extrato-agosto-classificacao.json', JSON.stringify(mov, null, 1), 'utf-8')

const plano = []
for (const m of mov || []) {
  if (m.categoria_id) continue
  const d = m.descricao || ''
  let nome = null; let porque = ''
  if (m.tipo === 'entrada') {
    if (/mesma tit/i.test(d)) { nome = 'Transferencias Internas - Entrada' }
    else { for (const [re, n, p] of REGRAS_ENTRADA) if (re.test(d)) { nome = n; porque = p; break } }
  } else {
    if (/mesma tit|mesma titularidade/i.test(d)) { nome = 'Transferencias Internas - Saida'; porque = 'transferencia entre contas proprias' }
    else { for (const [re, n, p] of REGRAS) { if (n && re.test(d)) { nome = n; porque = p; break } } }
  }
  plano.push({ id: m.id, data: m.data, tipo: m.tipo, valor: Number(m.valor), desc: d, categoria: nome, porque })
}

const ok = plano.filter((p) => p.categoria)
const duvida = plano.filter((p) => !p.categoria)
console.log(`SEM CATEGORIA: ${plano.length} | classificaveis pela descricao: ${ok.length} | sem regra: ${duvida.length}\n`)
for (const p of ok) console.log(`  ${p.data} | ${String(fmt(p.valor)).padStart(11)} | ${p.categoria.padEnd(34)} | ${p.desc.slice(0, 58)}`)
if (duvida.length) {
  console.log('\nSEM REGRA (fica pra voce decidir):')
  for (const p of duvida) console.log(`  ${p.data} | ${String(fmt(p.valor)).padStart(11)} | ${p.desc.slice(0, 70)}`)
}

if (!APLICAR) { console.log('\n(dry-run — rode com --aplicar para gravar)'); process.exit(0) }

let n = 0
for (const p of ok) {
  const cid = idDe[p.categoria]
  if (!cid) { console.log('categoria inexistente:', p.categoria); continue }
  const { error } = await sb.from('erp_movimentos_bancarios')
    .update({ categoria_id: cid, status_conciliacao: 'classificado' })
    .eq('id', p.id)
  if (error) console.log('ERRO', p.id, error.message); else n++
}
console.log(`\nAPLICADO: ${n} movimentos classificados. Backup em outputs/backup-extrato-agosto-classificacao.json`)
