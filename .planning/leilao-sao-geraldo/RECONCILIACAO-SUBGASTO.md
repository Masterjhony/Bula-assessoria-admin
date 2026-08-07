# Reconciliação do subgasto — 30/07

**Autor:** Estopim (Google Ads / mídia paga) · **Base:** relatório Meta Ads via conector oficial +
PostHog + planilha, janela 24–30/07, lido pelo Boss. Não tenho acesso à conta; tudo abaixo é
raciocínio sobre os números que me foram passados.

---

## (a) O subgasto é evento raro, redução de orçamento, ou limite de gastos da conta?

**Correção minha, primeiro:** eu disse antes que o subgasto vinha do evento de otimização raro
(`MQL-Sao-Geraldo`) estrangulando a entrega. **Os números novos derrubam isso como causa principal.**
Vale corrigir com o cliente, porque muda a ação.

### O que mata a hipótese do evento raro

1. **O perpétuo também está despencando** — 115 / 382 / 409 / 393 / 226 / 162 / 72(parcial). E o
   perpétuo **não otimiza por `MQL-Sao-Geraldo`**. Seja o que for que segura os dois, não é o evento
   do leilão.
2. **CPM caindo (R$22,71 → R$12,43) com gasto caindo junto é contraditório.** Frequência 1,98 em
   7 dias derruba saturação de público. Leilão barateando + público não saturado = se a entrega
   estivesse livre, o gasto **subiria**. Gasto caindo enquanto o leilão barateia é assinatura de
   **teto**, não de falta de demanda.
3. **O São Geraldo não está travado:** 21.058 impressões em 2 dias, 850 cliques, CTR 4,04%,
   CPM R$14,99. Conferindo: 21.058/1000 × 14,99 = **R$315,66**, que bate com os R$315,80 somados dos
   dois conjuntos (185,37 + 130,43). Os dados fecham entre si. Conjunto estrangulado não faz CTR de 4%.

### Veredito

**Restrição de conta compartilhada** — os dois campos caindo juntos enquanto o leilão melhora só se
explica por algo acima da campanha. Ordem de verificação:

| Checar | Onde | Tempo |
|---|---|---|
| **Limite de gastos da conta** | Gerenciador → ☰ → Cobrança → Configurações de pagamento → "Limite de gastos da conta" | 2 min |
| Coluna **"Entrega"** dos conjuntos | Se disser "Limitado pelo limite de gastos da conta" / "Limitado pelo orçamento", é decisivo | 1 min |
| Limite de faturamento / cartão recusado | Mesma tela — cobrança recusada estrangula tudo em silêncio | 2 min |
| **Orçamento real do perpétuo** | Ele gastou 115+382+409+393+226+162 = **R$1.687 em 6 dias ≈ R$281/dia**, contra os R$200/dia informados. Esse número está desatualizado — confirme qual é | 2 min |

O São Geraldo entregou R$315,80 em 2 dias = **R$157,90/dia contra R$300/dia autorizados (53%)**.
Metade da verba do leilão não está saindo, e faltam ~40h.

**Consequência operacional:** enquanto isso não for verificado, **não troque o evento de
otimização**. Se a causa é teto de conta, trocar o evento não destrava um real e você paga
volatilidade de graça.

---

## (b) A recomendação de Visualização da Página de Destino continua de pé?

**O CTR de 4,04% não muda nada — CTR nunca foi o argumento.** O argumento era escassez de evento, e
ela continua: o conjunto "Aberto" fez **2 MQL em 2 dias** (R$185,37 a R$92,69/MQL), ou seja ~7 em
7 dias contra os ~50 da régua do aprendizado.

**Mas a ordem mudou, e essa parte da minha recomendação fica SUSPENSA, não revogada:**

1. **Primeiro** resolva a restrição de conta (item a). Se o teto é a causa, levantá-lo destrava a
   verba sozinho, e trocar o evento vira volatilidade gratuita.
2. **Só se não houver teto**, troque o evento do conjunto **"CA - SAO GERALDO - web - Aberto"** para
   LPV — junto, no mesmo save dos cortes de posicionamento/idade/geo.
3. **`CA - SAO GERALDO - web e inst RMKT` nunca.** R$10,87 por conversão está funcionando; não se
   conserta o que funciona.

Segue valendo o que já estava no PLANO-48H: a Conversão Personalizada ampla (`URL contém
obrigado-saogeraldo`) deve existir **como medição**, não como evento de otimização — com ~3,5
leads/dia ela projeta ~25 eventos/7d contra os 50 necessários.

---

## (c) Vale editar a idade mínima para 35+ com ~40h de janela?

**Vale. Editar.** E a resposta é a conta, não o princípio.

Verba restante do SG em ~40h: 1,67 dia × R$300 ≈ **R$500** (se o teto permitir).

| Cenário | Verba que vai para 18–34 | MQL gerados |
|---|---|---|
| Não editar (18–34 segue com 42,9% da verba) | R$214,50 a **R$151,38**/MQL | **1,4 MQL** |
| Editar (essa verba migra para 35+/45+) | R$214,50 a **R$66,80**/MQL | **3,2 MQL** |

**Delta: ~+2 MQL.** (Confirmando as bases: 756,91/5 = R$151,38 · 601,18/9 = R$66,80 · razão 2,27x.)

**Custo do reset: praticamente zero neste conjunto.** O princípio que escrevi no PLANO-48H — "não
edite para não resetar aprendizado" — vale para conjunto que **está** aprendendo. Este nunca saiu do
aprendizado: 2 MQL em 2 dias contra os ~7/dia necessários. Não há status de aprendizado concluído a
destruir; o custo real é algumas horas de entrega volátil.

E é a **segunda vez** que o ponto de idade aparece em relatório sem ser aplicado (o primeiro foi
25/07). O custo acumulado da não-decisão já passou o custo do reset.

### Três ajustes de execução

1. **Mínimo 35, não 45.** A banda 35–44 não veio no relatório e eu não corto faixa que não vi. E se
   o gargalo for teto/capacidade de gasto, estreitar alcance é contraproducente — 35+ mata a banda
   comprovadamente cara (18–34) preservando volume.
2. **Máximo em 65+**, não travado em 65 — 65+ é a faixa mais barata (R$49,01).
3. **Um único save por conjunto.** Posicionamento (cortar Audience Network), idade e geo entram na
   **mesma edição**. Você paga a volatilidade uma vez, não três. Fazer **hoje à noite**, para a
   turbulência cair na madrugada e 31/07 — o dia mais caro — começar estável.

---

## Apêndice — os três cortes confirmados

- **Audience Network:** R$147,70 / 1.385 impr. = **CPM R$106,64**; 264/1.385 = **19% de CTR**. CTR de
  19% com CPM 8x o do Instagram não é engajamento, é assinatura de clique acidental. Zero MQL
  confirma. **Cortar nos dois conjuntos.**
- **Idade:** ver (c). **Mínimo 35.**
- **SP e BA:** cortar **só no conjunto "Aberto"**. No RMKT o público é quem já visitou a landing —
  qualificado por comportamento, independente de UF, a R$10,87/conversão.
  Ressalva honesta: 0 MQL em 14 leads pode ser amostra pequena, não prova. Com R$389 gastos e 40h de
  janela, é aposta barata de errar. MT (3 MQL em 4 leads), MG e MA absorvem.
- **Perpétuo:** deixar quieto até 02/08 — resetar conjunto que roda há semanas na véspera é risco sem
  upside para o leilão. **Exceção:** se confirmar teto de conta, os dois campos dividem a mesma bolsa
  e cada real queimado em Audience Network no perpétuo é um real roubado do leilão — nesse caso,
  cortar AN no perpétuo hoje também.
