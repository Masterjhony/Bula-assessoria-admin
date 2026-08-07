# Recomendação 10 — renomear `touros_view` / `touros_lead_submitted` na landing do lançamento

**Data:** 30/07/2026 · **Frente:** infra & tracking
**Decisão: RENOMEAR e atualizar o consumidor junto — DEPOIS de 01/08.** Não disparar dois nomes.

---

## O fato

`src/app/saogeraldo/_lib/analytics.ts` dispara `touros_view` (linha 75) e `touros_lead_submitted`
(linha 110). Os micro-eventos do funil já saíram com prefixo próprio (`saogeraldo_form_started`,
`saogeraldo_step_reached`…); só os dois principais ficaram com o nome do perpétuo. Em PostHog eles
caem no mesmo balde de `src/app/touros/_lib/analytics.ts` (linhas 84 e 126), que dispara exatamente
os mesmos dois nomes. Ou seja: **a conversão do lançamento e a do perpétuo são indistinguíveis pelo
nome do evento.**

## A ressalva, medida

`scripts/gera-relatorio-campanhas-2026-07-30.mjs` **não existe no repositório** — procurei por
`find . -name "*relatorio-campanhas*"` na árvore inteira e por `grep` nos nomes antigos. Os únicos
consumidores em código são os dois `analytics.ts`. Então "atualizar a consulta junto" **não é
trabalho de código**: é editar os insights/dashboards no PostHog, na interface.

Se esse script existir fora do repo, ele entra na mesma lista de 2 itens abaixo.

## Por que renomear e não disparar os dois nomes

1. **Disparar os dois não resolve o problema.** A contaminação continua: `touros_lead_submitted`
   segue recebendo conversão do lançamento misturada com a do perpétuo. Paga-se um deploy e a
   pergunta original — "quantas conversões são do lançamento?" — continua sem resposta pelo nome.
2. **Duplo nome cria janela de dupla contagem.** Qualquer painel que some os dois passa a contar o
   lead do lançamento duas vezes enquanto a janela durar.
3. **A série histórica que se parte é curta e acaba junto com o evento.** A do lançamento tem 5
   dias e termina em 01/08. A do perpétuo **não é afetada**: `touros/_lib/analytics.ts` não é
   tocado (D-04).
4. **Hoje dá para separar sem deploy nenhum.** Em PostHog, filtre por `$current_url` contendo
   `saogeraldo`. Resolve a leitura desta janela com zero risco — que é o motivo de nada disso ser
   urgente.

## Por que depois de 01/08

Renomear é **zero risco para a conversão** — PostHog não está no caminho do dinheiro, quem dispara
Meta/GA4 é o GTM pelo Page View da URL de obrigado. Mas é um deploy num arquivo da landing a ~40h do
leilão, para resolver um problema de leitura que o filtro por URL já resolve. Não compensa. Entra na
primeira janela depois do evento.

## O patch, para aplicar depois — 2 linhas, só em `saogeraldo/`

```diff
--- a/src/app/saogeraldo/_lib/analytics.ts
+++ b/src/app/saogeraldo/_lib/analytics.ts
@@ -75
-  ph?.capture('touros_view', { ...utmProps })
+  ph?.capture('saogeraldo_view', { ...utmProps })
@@ -110
-  posthog?.capture('touros_lead_submitted', {
+  posthog?.capture('saogeraldo_lead_submitted', {
```

Mais o comentário da linha 95, que cita o nome antigo na documentação da função.

**NÃO tocar `src/app/touros/_lib/analytics.ts`** — é o perpétuo, está em produção convertendo (D-04).

## Checklist do dia de aplicar

- [ ] Trocar os dois nomes + o comentário da linha 95, só em `saogeraldo/_lib/analytics.ts`.
- [ ] Atualizar os insights do PostHog que apontam para os nomes antigos, **no mesmo dia** — senão o
      painel do lançamento zera silenciosamente e alguém vai achar que a conversão caiu.
- [ ] Se o `gera-relatorio-campanhas-*.mjs` existir fora do repo, trocar os nomes lá também.
