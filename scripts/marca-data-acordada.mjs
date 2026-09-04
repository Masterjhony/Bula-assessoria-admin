/**
 * MARCA QUAIS CONTAS A RECEBER TÊM DATA COMBINADA.
 *
 * POR QUE ESTE SCRIPT EXISTE
 * O vencimento de um CR de comissão nasce automático (data do leilão + 45 dias)
 * porque o título precisa de uma data para existir. Essa data não foi combinada
 * com ninguém — e projetar caixa em cima dela é chute com cara de número.
 * Decisão do João em 04/09/2026: *"essas datas e operações automáticas não devem
 * ser levadas em conta, somente quando combinamos com quem vai pagar a data"*.
 *
 * A marca fica na tag `data-acordada` do próprio título, então ela sobrevive a
 * qualquer regeração do painel e pode ser mantida por quem combina a data.
 *
 *   node scripts/marca-data-acordada.mjs                    # mostra a situação
 *   node scripts/marca-data-acordada.mjs --apply            # aplica a lista abaixo
 *   node scripts/marca-data-acordada.mjs --limpar --apply   # tira todas as marcas
 *
 * Para combinar uma data nova: acrescente a linha em ACORDADAS com a data e a
 * fonte (quem disse, quando) e rode com --apply.
 */
import { readFileSync } from 'node:fs'
import pg from 'pg'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const APPLY = process.argv.includes('--apply')
const LIMPAR = process.argv.includes('--limpar')
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

/**
 * Cada entrada é uma data que ALGUÉM combinou com quem paga. `fonte` tem que
 * dizer quem e quando — sem isso a data volta a ser chute.
 */
const ACORDADAS = [
  { like: '%2a ETAPA NAVIRAI MATRIZES%', data: '2026-09-10', fonte: 'João no Grupo Financeiro, 04/09/2026 16:46' },
  { like: '%LEILAO VIRTUAL NAVIRAI - MATRIZES%', data: '2026-09-10', fonte: 'João no Grupo Financeiro, 04/09/2026 16:46' },
  { like: '%JMP - TOUROS%', data: '2026-09-10', fonte: 'João no Grupo Financeiro, 04/09/2026 16:46' },
  { like: '%JMP - FEMEAS/BEZERRAS%', data: '2026-09-10', fonte: 'João no Grupo Financeiro, 04/09/2026 16:46' },
  { like: '%GUADALUPE AGROPECUARIA - TOUROS 19/07%', data: '2026-09-25', fonte: 'parcelamento 2x acordado — 1/2 recebida em 25/08 (planilha FLCX Set/26)' },
  { like: '%GUADALUPE AGROPECUARIA - TOUROS 20/07%', data: '2026-09-25', fonte: 'parcelamento 2x acordado — 1/2 recebida em 25/08 (planilha FLCX Set/26)' },
  { like: '%GENETICA ADITIVA - FEMEAS%', data: '2026-09-26', fonte: 'parcelamento 2x acordado, NF 636 — 1/2 recebida em 26/08' },
  { like: '%GENETICA ADITIVA - TOUROS%', data: '2026-09-26', fonte: 'parcelamento 2x acordado, NF 636 — 1/2 recebida em 26/08' },
]

/**
 * A lista acima é a ÚNICA fonte: qualquer título marcado fora dela perde a
 * marca. Sem isso a marca vira lixo acumulado — foi o que aconteceu com a tag
 * `data_confirmada` (com underline), que sobrou de outra rotina e chegou a
 * marcar o Lagoa dos Patos, vencido desde maio e com o próprio ERP dizendo
 * "cobranca-devedor-enrola".
 */
const TAG_LEGADA = 'data_confirmada'

if (LIMPAR) {
  const r = await c.query(`select id, descricao from erp_contas_receber
    where tags @> '["data-acordada"]'::jsonb`)
  console.log(`limpando ${r.rows.length} marca(s)`)
  if (APPLY) await c.query(`update erp_contas_receber
    set tags = (select coalesce(jsonb_agg(t), '[]'::jsonb) from jsonb_array_elements(tags) t where t <> '"data-acordada"'),
        observacoes = nullif(regexp_replace(coalesce(observacoes,''), '\\s*\\[data combinada:[^\\]]*\\]', '', 'g'), '')
    where tags @> '["data-acordada"]'::jsonb`)
}

console.log(APPLY ? 'APLICANDO\n' : '[SIMULACAO — nada gravado]\n')
for (const a of ACORDADAS) {
  const r = await c.query(`select id, descricao, valor::float v, vencimento::date venc, tags
    from erp_contas_receber
    where descricao ilike $1 and status in ('aberto','parcial','vencido') and substituido_por is null`, [a.like])
  if (!r.rows.length) { console.log(`  !! nenhum título casa com ${a.like}`); continue }
  for (const t of r.rows) {
    const mudaData = String(t.venc).slice(0, 10) !== a.data
    console.log(`  ${brl(t.v).padStart(15)}  ${t.descricao.slice(0, 52)}`)
    console.log(`  ${' '.repeat(15)}  venc ${String(t.venc).slice(0, 10)}${mudaData ? ` → ${a.data}` : ' (ok)'} · ${a.fonte}`)
    if (!APPLY) continue
    await c.query(`update erp_contas_receber
      set vencimento = $1,
          tags = case when tags @> '["data-acordada"]'::jsonb then tags
                      else coalesce(tags,'[]'::jsonb) || '["data-acordada"]'::jsonb end,
          observacoes = coalesce(nullif(regexp_replace(coalesce(observacoes,''), '\\s*\\[data combinada:[^\\]]*\\]', '', 'g'), ''), '')
                        || ' [data combinada: ' || $2 || ']',
          status = case when $1::date < current_date then 'vencido' else 'aberto' end
      where id = $3`, [a.data, a.fonte, t.id])
  }
}

/* Tira a marca de quem saiu da lista, e apaga a tag legada em todo lugar. */
{
  const naLista = []
  for (const a of ACORDADAS) {
    const r = await c.query(`select id from erp_contas_receber where descricao ilike $1
      and status in ('aberto','parcial','vencido') and substituido_por is null`, [a.like])
    naLista.push(...r.rows.map(x => x.id))
  }
  const sobrando = await c.query(`select id, descricao, tags from erp_contas_receber
    where (tags @> '["data-acordada"]'::jsonb or tags @> $2::jsonb)
      and status in ('aberto','parcial','vencido') and substituido_por is null
      and not (id = any($1::uuid[]))`, [naLista, JSON.stringify([TAG_LEGADA])])
  if (sobrando.rows.length) {
    console.log(`\n  marca removida de ${sobrando.rows.length} título(s) que não estão na lista:`)
    for (const t of sobrando.rows) console.log(`     ${t.descricao.slice(0, 60)}  ${JSON.stringify(t.tags)}`)
  }
  if (APPLY) {
    // remove data-acordada de quem saiu da lista
    await c.query(`update erp_contas_receber set tags =
      (select coalesce(jsonb_agg(t),'[]'::jsonb) from jsonb_array_elements(tags) t where t <> '"data-acordada"')
      where tags @> '["data-acordada"]'::jsonb and not (id = any($1::uuid[]))`, [naLista])
    // a tag legada some de todo mundo: uma ideia, um nome
    await c.query(`update erp_contas_receber set tags =
      (select coalesce(jsonb_agg(t),'[]'::jsonb) from jsonb_array_elements(tags) t where t <> to_jsonb($1::text))
      where tags @> to_jsonb($1::text)`, [TAG_LEGADA])
  }
}

const marcadas = await c.query(`select count(*)::int n,
  coalesce(sum(valor-coalesce(desconto,0)+coalesce(juros,0)+coalesce(multa,0)-coalesce(valor_recebido,0)),0)::float s
  from erp_contas_receber where tags @> '["data-acordada"]'::jsonb
    and status in ('aberto','parcial','vencido') and substituido_por is null`)
const todos = await c.query(`select count(*)::int n,
  coalesce(sum(valor-coalesce(desconto,0)+coalesce(juros,0)+coalesce(multa,0)-coalesce(valor_recebido,0)),0)::float s
  from erp_contas_receber where status in ('aberto','parcial','vencido') and substituido_por is null`)
console.log(`\n  com data combinada: ${marcadas.rows[0].n} título(s), ${brl(marcadas.rows[0].s)}`)
console.log(`  total em aberto:    ${todos.rows[0].n} título(s), ${brl(todos.rows[0].s)}`)
console.log(`  SEM data combinada: ${todos.rows[0].n - marcadas.rows[0].n} título(s), ${brl(todos.rows[0].s - marcadas.rows[0].s)} — fora do fluxo`)
if (!APPLY) console.log('\nRode de novo com --apply para gravar.')
await c.end()
