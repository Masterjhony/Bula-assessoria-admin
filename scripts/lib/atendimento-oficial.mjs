/**
 * A regra da métrica de atendimento, em SQL — para os relatórios que falam
 * direto com o Postgres.
 *
 * ESPELHO de `src/lib/atendimento-stats.ts`, que é a fonte única do app. Se um
 * dos dois mudar, o outro muda junto: os números foram fechados contra o
 * faturamento da Meta (1.837 disparos apurados × 1.832 cobrados) e é essa
 * equivalência que dá o direito de confiar neles.
 *
 * Use assim:
 *
 *   import { CTE_ATENDIMENTO } from './lib/atendimento-oficial.mjs'
 *   const r = await q(`${CTE_ATENDIMENTO}
 *     select count(*) pessoas from primeiro`)
 *
 * O CTE publica cinco relações:
 *   oficial  — mensagens no recorte (só Cloud API, sem grupo), com `k` = telefone canônico
 *   entrada  — as inbound, por `k`
 *   disparo  — abordagens: outbound que SAIU e sem inbound do mesmo `k` nas 24h antes
 *   primeiro — 1º disparo de cada pessoa
 *   resposta — por pessoa, se respondeu em até 72h do 1º disparo
 */

/** Janela em que a inbound conta como resposta ao disparo. */
export const JANELA_RESPOSTA = `interval '72 hours'`
/** Janela de sessão da Meta: dentro dela a resposta é livre e grátis. */
export const JANELA_SESSAO = `interval '24 hours'`

/** Só dígitos do telefone. */
const DIGITOS = `regexp_replace(m.phone, '[^0-9]', '', 'g')`

export const CTE_ATENDIMENTO = `
with oficial as (
  select m.*,
         -- telefone canônico: sem DDI e sem o nono dígito (igual a foneKey() do TS).
         -- Sem isso "5567998894887" e "6798894887" viram duas pessoas.
         case when length(_d.d) = 11 and substr(_d.d, 3, 1) = '9'
              then substr(_d.d, 1, 2) || substr(_d.d, 4)
              else _d.d end as k
    from whatsapp_messages m
    cross join lateral (
      select case when ${DIGITOS} like '55%' and length(${DIGITOS}) >= 12
                  then substr(${DIGITOS}, 3)
                  else ${DIGITOS} end as d
    ) _d
   where m.phone not like '%@g.us'
     and (m.channel = 'cloud' or (m.channel is null and m.status = 'sent'))
),
entrada as (
  select k, created_at from oficial where direction = 'inbound' and k <> ''
),
disparo as (
  -- Abordagem: saiu de fato E não é resposta nossa dentro de conversa aberta.
  -- É exatamente o caso em que a Meta exige template e cobra — por isso a
  -- contagem pode ser conferida contra a fatura dela.
  select o.k, o.origin, o.created_at
    from oficial o
   where o.direction = 'outbound'
     and o.status in ('sent', 'delivered', 'read')
     and o.k <> ''
     and not exists (
       select 1 from entrada e
        where e.k = o.k
          and e.created_at < o.created_at
          and e.created_at > o.created_at - ${JANELA_SESSAO})
),
primeiro as (
  select k, min(created_at) t from disparo group by 1
),
resposta as (
  select p.k, p.t,
         exists (select 1 from entrada e
                  where e.k = p.k and e.created_at > p.t
                    and e.created_at < p.t + ${JANELA_RESPOSTA}) respondeu
    from primeiro p
),
primeiro_origem as (
  select origin, k, min(created_at) t from disparo group by 1, 2
),
resposta_origem as (
  -- Para recortar por campanha/origem SEMPRE use esta relação, nunca um join de
  -- disparo com resposta: medir a partir do 1º disparo GLOBAL da pessoa faz
  -- a campanha de follow-up herdar a resposta que o lead já tinha dado antes e
  -- aparecer com taxa absurda (o motor diário saltava de 3,8% para 57%).
  select po.origin, po.k, po.t,
         exists (select 1 from entrada e
                  where e.k = po.k and e.created_at > po.t
                    and e.created_at < po.t + ${JANELA_RESPOSTA}) respondeu
    from primeiro_origem po
)`
