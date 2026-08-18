/**
 * DEDUP do espelho do extrato (18/08/2026).
 *
 * O espelhamento criou um título por movimento bancário sem vínculo. Parte
 * desses movimentos são PAGAMENTOS AGREGADOS de títulos analíticos que já
 * existiam: no banco sai um PIX único de R$ 40.430 para "FO ASSESSORIA
 * (FABIO OMENA)", enquanto no ERP existem N títulos de comissão por leilão do
 * Fábio que somam exatamente isso. Sem dedup, R$ 341 mil ficam contados duas
 * vezes em "Pago".
 *
 * Casamento por PESSOA, que é como o pagamento acontece na prática:
 *   1. extrai o beneficiário da descrição do movimento (Leonardo, Douglas,
 *      Fábio, Rusa, Bulinha…);
 *   2. junta os títulos analíticos pagos da MESMA pessoa, mesma categoria,
 *      data de pagamento em ±3 dias;
 *   3. se a soma bate com o valor do movimento (±R$ 0,01), o espelho é
 *      redundante: apaga o espelho e vincula o movimento ao maior título
 *      analítico, anotando quantos títulos aquele pagamento cobriu.
 *
 * O que não casar continua como está — nada é apagado no escuro.
 *
 * Dry-run por padrão; --apply grava.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const TAG = 'espelho-extrato'
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const dia = d => String(d || '').slice(0, 10)
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const dif = (a, b) => Math.abs((new Date(dia(a) + 'T00:00:00') - new Date(dia(b) + 'T00:00:00')) / 86400000)

// beneficiários que aparecem tanto no extrato quanto na descrição do título
const PESSOAS = [
  { chave: 'leonardo', re: /leonardo|lm assessoria|serafim/ },
  { chave: 'douglas', re: /douglas|agrobispo/ },
  { chave: 'fabio', re: /fabio|fábio|f o assessoria|fo assessoria|59791094|59\.791\.094/ },
  { chave: 'rusa', re: /rusa/ },
  { chave: 'bulinha', re: /bulinha|felipe (vilela )?andrade|02488025186/ },
  { chave: 'marcelo', re: /marcelo/ },
  { chave: 'peralta', re: /peralta/ },
  { chave: 'nane', re: /\bnane\b/ },
  { chave: 'laila', re: /laila/ },
  { chave: 'lucas', re: /lucas/ },
  { chave: 'matheus', re: /matheus|mateus/ },
  { chave: 'formula', re: /formula do boi|fórmula do boi|65565807/ },
]
const pessoasDe = txt => { const t = norm(txt); return PESSOAS.filter(p => p.re.test(t)).map(p => p.chave) }

async function all(table, cols, filtro = q => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filtro(sb.from(table).select(cols)).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

const cps = await all('erp_contas_pagar', 'id,descricao,valor,valor_pago,data_pagamento,status,categoria_id,tags')
const movs = await all('erp_movimentos_bancarios', 'id,data,valor,categoria_id,conta_pagar_id,descricao,observacoes', q => q.eq('tipo', 'saida'))
const cats = await all('erp_categorias', 'id,nome')
const catNome = new Map(cats.map(c => [c.id, c.nome]))

const ehEspelho = t => Array.isArray(t.tags) && t.tags.includes(TAG)
const pagos = cps.filter(t => t.status === 'pago' && t.data_pagamento)
const analiticos = pagos.filter(t => !ehEspelho(t))
const espelhos = pagos.filter(ehEspelho)
const movPorTitulo = new Map(movs.filter(m => m.conta_pagar_id).map(m => [m.conta_pagar_id, m]))

// analíticos ainda não "consumidos" por outro pagamento
const consumido = new Set()
const redundantes = []
let total = 0

// ordena por valor desc: casa primeiro os pagamentos grandes (mais específicos)
for (const e of [...espelhos].sort((a, b) => Number(b.valor) - Number(a.valor))) {
  const v = r2(e.valor_pago || e.valor)
  const quem = pessoasDe(e.descricao)
  if (!quem.length) continue
  const grupo = analiticos.filter(t =>
    !consumido.has(t.id) &&
    t.categoria_id === e.categoria_id &&
    dif(t.data_pagamento, e.data_pagamento) <= 3 &&
    pessoasDe(t.descricao).some(p => quem.includes(p)))
  if (!grupo.length) continue
  const soma = r2(grupo.reduce((s, t) => s + Number(t.valor_pago || t.valor || 0), 0))
  if (Math.abs(soma - v) > 0.01) continue      // não explica exatamente: não mexe
  grupo.forEach(t => consumido.add(t.id))
  redundantes.push({ e, grupo, v, soma, quem })
  total += v
}

console.log(`Espelhos redundantes (pagamento agregado de títulos analíticos): ${redundantes.length} · ${brl(total)}\n`)
for (const r of redundantes) {
  console.log(`  ${dia(r.e.data_pagamento)} ${catNome.get(r.e.categoria_id)} · ${r.quem.join('/')} · ${brl(r.v)}`)
  console.log(`     extrato: ${String(r.e.descricao).slice(0, 72)}`)
  console.log(`     = ${r.grupo.length} título(s) analítico(s) somando ${brl(r.soma)}`)
}

const sobra = espelhos.filter(e => !redundantes.some(r => r.e.id === e.id))
const analiticosSoltos = analiticos.filter(t => !consumido.has(t.id) && !movPorTitulo.has(t.id))
console.log(`\nEspelhos mantidos: ${sobra.length} (${brl(sobra.reduce((s, t) => s + Number(t.valor || 0), 0))})`)
console.log(`Analíticos pagos ainda sem movimento casado: ${analiticosSoltos.length} (${brl(analiticosSoltos.reduce((s, t) => s + Number(t.valor_pago || t.valor || 0), 0))})`)

if (!APPLY) { console.log('\nDRY-RUN. Use --apply para gravar.'); process.exit(0) }

let ok = 0, err = 0
for (const r of redundantes) {
  const mov = movPorTitulo.get(r.e.id)
  const alvo = [...r.grupo].sort((a, b) => Number(b.valor_pago || b.valor) - Number(a.valor_pago || a.valor))[0]
  if (mov) {
    const nota = `[18/08/2026] Pagamento agregado: cobriu ${r.grupo.length} título(s) de ${catNome.get(r.e.categoria_id)} (${brl(r.soma)}). Vinculado ao maior deles — o vínculo do schema é 1:1.`
    const { error: e1 } = await sb.from('erp_movimentos_bancarios')
      .update({ conta_pagar_id: alvo.id, observacoes: nota }).eq('id', mov.id)
    if (e1) { err++; console.error('  ERRO vínculo: ' + e1.message); continue }
  }
  const { error: e2 } = await sb.from('erp_contas_pagar').delete().eq('id', r.e.id)
  if (e2) { err++; console.error('  ERRO delete: ' + e2.message); continue }
  ok++
}
console.log(`\n-> ${ok} títulos-espelho redundantes removidos${err ? ` · ${err} erros` : ''}`)
console.log('APLICADO.')
