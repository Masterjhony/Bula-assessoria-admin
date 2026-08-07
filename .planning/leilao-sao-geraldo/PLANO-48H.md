# Plano de 48h — Leilão Touros São Geraldo e 7P

**Data:** 30/07/2026 · **Evento:** 01/08/2026, sábado, 12h · **Janela:** 2 dias
**Contexto:** campanha trouxe 3 leads em 30/07. Fatos de medição apurados pelo Boss e conferidos
contra `AUDITORIA-MEDICAO.md` e `BRIEF.md`.

Li o BRIEF e a AUDITORIA-MEDICAO — meus fatos batem com os seus. Um ponto que muda a jogada e que
sai da auditoria: o evento sujo `gtm.dom` **carrega a URL da página**. Isso significa que Conversão
Personalizada por URL no Events Manager funciona **sem tocar no GTM**. É o atalho de tudo abaixo.

---

## a) Jogada de campanha para as próximas 48h

### A premissa que decide tudo
Meta precisa de ~50 eventos de otimização por conjunto/7 dias para sair do aprendizado (isso é
documentação da plataforma, não estimativa minha). Com 3 leads/dia e 2 dias de janela, **nenhum
conjunto otimizado por conversão de site vai sair do aprendizado antes do leilão**. Consequência
prática: consertar o sinal de conversão do pixel é obrigatório para **medição e para a próxima
campanha** — mas não vai salvar a otimização desta. Não gaste as 48h atrás disso.

### O que NÃO fazer
Não mexer em evento de otimização, público, posicionamento ou criativo do conjunto que já está
entregando. Cada uma dessas edições é reset de aprendizado, e não há tempo de reaprender. O único
lever permitido no conjunto existente é **orçamento**, subindo escalonado (a prática de mercado é
~20% por vez; não é limiar documentado, é heurística) em vez de dobrar de uma vez.

### O que fazer com o conjunto atual — árvore de decisão
Depende de um dado que só você vê (item 1 da lista em (c)):

- **Se está otimizando por uma conversão de site (Lead / conversão personalizada):** ele está
  entregando às cegas, porque o pixel nunca recebeu `Lead`. Não edite — **corte o orçamento dele
  para o mínimo e mova a verba para os conjuntos novos abaixo**. Editar orçamento não destrói nada
  que já não esteja quebrado.
- **Se está otimizando por cliques no link / visualizações da landing:** está funcionando dentro do
  que dá, deixe rodando intacto até 01/08 e só suba verba em degraus.

### Onde entra a verba nova: sinal que não depende do pixel
Abra **em paralelo**, sem tocar no que existe:

1. **Campanha de Mensagens — Click-to-WhatsApp, otimizando por "conversas iniciadas".** É onde eu
   colocaria a maior parte da verba nova. O evento é da própria Meta, chega em minutos, e o volume
   é ordens de grandeza maior que o do formulário — então é o único conjunto que tem chance real de
   aprender dentro da janela. E o fecho do leilão acontece no WhatsApp do assessor de qualquer jeito.
2. **Campanha de Leads com Formulário Instantâneo**, com as perguntas de qualificação dentro do form
   (tamanho do rebanho, tem inscrição estadual, quantos touros). Sinal nativo, zero dependência de pixel.

**Contrapartida honesta dessas duas, e você precisa decidir sabendo:** elas contornam o servidor,
então a régua de MQL (`≥100 cabeças E IE`) não é aplicada e o lead não cai no `crm_leads` pelo
caminho normal. Qualificação vira trabalho humano no WhatsApp e exportação manual do Instant Form.
Em janela de 2 dias eu aceito essa troca; em campanha perpétua, não.

### Calendário de queima
Leilão é sábado 01/08 às 12h. Pico de verba: hoje à noite e o dia inteiro de 31/07. Em 01/08 só até
~11h, com a copy trocada para "começa hoje, 12h". **Coloque data de término nas campanhas** — a
página fica no ar depois do evento (pós-evento está fora de escopo no BRIEF), então nada impede a
verba de queimar em um leilão que já aconteceu. Nenhum conjunto novo depois da manhã de 31/07: o que
sobe no último dia não aprende, só gasta.

---

## b) Segmentação, criativo e orçamento

**Antes de ajustar, um diagnóstico que custa 2 minutos e muda a resposta:** olhe impressões →
cliques no link → visualizações da landing → leads do conjunto ativo. Se cai muito entre clique e
LPV, é entrega/página (improvável: 200, 0,26s, 118KB). Se LPV está alto e leads em 3, **o gargalo
são os 7 campos obrigatórios em 2 passos** — e aí o WhatsApp/Instant Form deixa de ser plano B e
vira o plano.

**Segmentação**
- O maior ganho disponível não é interesse, é **Lookalike a partir do seu próprio CRM**. Exporte os
  telefones dos leads com `is_mql = true` do `crm_leads`, suba como Público de Clientes e crie um
  LAL 1%. É a única forma de o algoritmo enxergar "lead que vale ≥100 cabeças + IE" — a régua existe
  no servidor e não chega ao pixel por nenhum outro caminho. Suba **hoje**: o público leva tempo
  para popular.
- Público de site por URL funciona (o `gtm.dom` registra a URL): retarget de quem visitou
  `saogeraldo` e **exclusão de quem já bateu em `obrigado-saogeraldo`** — pare de pagar por quem já
  se cadastrou. Se o público de retarget estiver pequeno demais para entregar, use só como exclusão.
- Amplo + geo + Advantage. Com volume desse tamanho, empilhar interesses de pecuária fragmenta o
  pouco que existe e piora tudo.
- **Ask para o cliente, hoje:** a lista de UFs onde não é possível entregar. O BRIEF diz que existe
  região sem entrega e a leitura do mapa foi cancelada — então hoje você pode estar pagando por lead
  que nunca vai receber o touro. Não deduza por geografia; peça a lista e exclua no geo.

**Criativo** (ordem que eu testaria, 3 variações no máximo — mais que isso divide a verba)
1. **Urgência + escala:** "Sábado, 12h. 134 lotes de Nelore PO." Contagem regressiva.
2. **Condição de pagamento** — é a oferta mais forte e incondicional que você tem: 30 parcelas
   (2+2+2+2+2+20), 10% à vista, 4% em 1+11, e 1+29 acima de 4 lotes.
3. **Genética/prova:** selos de MÃE/AVÓ de touro de central, índices DEP/iABCZ/MGTe, animais de
   21–24 meses. É o argumento que fala com quem tem rebanho grande.

Formato: **vertical 9:16 recortado dos vídeos dos lotes** (132 dos 134 têm vídeo). É o ativo mais
rápido de produzir em 48h, custo zero de design, e é imagem oficial do criatório.

**Qualificação vai na copy, não no algoritmo.** Como o Meta não consegue otimizar por MQL nesta
janela, o filtro tem que ser explícito no anúncio: "para quem compra touro em lote", "rebanho a
partir de 100 cabeças". Você perde alcance de propósito — é isso que evita 40 leads sem valor.

**Não escreva "frete grátis"** em anúncio nenhum. O catálogo tem faixa sob consulta e região sem
entrega; o BRIEF já cortou o tema da página pelo mesmo motivo.

**Orçamento/lance:** concentre, não espalhe. Mantenha lance automático — cost cap com 2 dias
estrangula a entrega justamente durante o aprendizado. Corte qualquer conjunto sem lead até o
meio-dia de 31/07 e realoque.

---

## c) O que você precisa abrir — mínimo e em ordem de impacto

**Regra que atravessa a lista: não publique o GTM nestas 48h.** Publicar sobe o workspace inteiro e
a auditoria achou indício de trabalho não publicado lá dentro. Tudo abaixo é UI de Events Manager /
GA4 / Ads, zero deploy, zero dev.

### Meta
| # | Onde | Tempo | Por que |
|---|---|---|---|
| 1 | Gerenciador de Anúncios → conjunto ativo: qual o **evento de otimização** e qual **pixel** está vinculado (`1539…` ou `899…`) | 2 min | Sem isso, qualquer ajuste é chute — é o que decide a árvore do item (a) |
| 2 | Events Manager → Conversões personalizadas → **regra do perpétuo, adicionar exclusão de `saogeraldo`** | 3 min | Hoje todo MQL do leilão conta como conversão do perpétuo: envenena a otimização de uma campanha que já roda e falseia o número dos dois funis |
| 3 | Criar 2 conversões personalizadas no pixel certo: URL contém `obrigado-saogeraldo-mql` e `obrigado-saogeraldo-lead` | 5 min | O `gtm.dom` é sujo mas leva a URL — a regra por URL funciona sem tocar no GTM. É a única forma de existir número de conversão do leilão. Assuma que só conta daqui pra frente |
| 4 | Públicos → do site: `saogeraldo` 30d (retarget) e `obrigado-saogeraldo` (exclusão) | 5 min | Para de pagar por quem já se cadastrou e reimpacta quem viu o catálogo e não converteu |
| 5 | Públicos → Lista de clientes: telefones de `is_mql = true` → **Lookalike 1%** | 20 min + processamento | Único caminho para o algoritmo enxergar "lead que vale". Quanto mais cedo, mais chance de estar pronto para 31/07 |

### Google Ads / GA4
| # | Onde | Tempo | Por que |
|---|---|---|---|
| 6 | Ads → Ferramentas → Conversões: o que existe e o que está como **primária** | 3 min | Descobre se alguma campanha está com lance inteligente otimizando por nada — se estiver, troque para Maximizar cliques hoje |
| 7 | Ads → Termos de pesquisa dos últimos 7 dias → negativar (se houver campanha de busca ativa) | 10 min | Com verba concentrada em 2 dias, clique irrelevante custa caro e não dá tempo de diluir |
| 8 | GA4 `G-X00P526WF7` → Admin → Eventos → criar evento a partir de `gtm.dom` com condição `page_location` contém `obrigado-saogeraldo-mql` → marcar como evento-chave → importar no Ads | 15 min | Única rota sem dev para o Ads enxergar conversão do leilão. **Serve para relatório, não vai dar tempo de otimizar lance** |
| 9 | Confirmar vínculo GA4 ↔ Google Ads | 2 min | O item 8 não existe sem ele |

---

## O que eu preciso de você para afinar (não trava nada acima)
1. Evento de otimização + pixel do conjunto ativo (item 1).
2. Orçamento diário atual e como está dividido.
3. Existe campanha de Google Ads no ar para o leilão, ou só Meta?
4. Impressões / cliques / LPV / leads do conjunto, últimos 3 dias.

**Reporto e não mexo, conforme meu escopo:** o formulário de 7 campos obrigatórios em 2 passos é o
suspeito número um dos 3 leads/dia, e a correção da regra 1 do GTM (`gtm.dom` virando evento) é
trabalho para **depois de 01/08** — publicar container agora é risco desnecessário na véspera.

---

## Adendo 30/07 — dados da conta

Dados lidos do print do conjunto ativo do São Geraldo (leitura do Boss, não medição minha):

| Campo | Valor |
|---|---|
| Local da conversão | Formulários no site e instantâneos |
| Meta de desempenho | Maximizar o número de conversões |
| Conjunto de dados (pixel) | `Pixel-Touro-Perpetuo` |
| Evento de conversão | `MQL-Sao-Geraldo` (ID `1715151536201186`) |
| Verba | R$500/dia total — R$200 perpétuo, **R$300 São Geraldo** |

Isso resolve o item 1 da lista (c) e mostra que o item 3 estava **parcialmente feito**: a Conversão
Personalizada do leilão já existe. Mas o conjunto está otimizando pelo **evento mais raro do funil**
(`≥100 cabeças E inscrição estadual`), e ela vive **dentro do pixel do perpétuo**.

### 1. Trocar o evento de otimização agora é correto?

**Concordo com a leitura do Boss.** Não há aprendizado a proteger, então o argumento de "não edite
para não resetar aprendizado" — que eu mesmo escrevi acima — **não se aplica a este conjunto**. Ele
vale para um conjunto que está aprendendo; este nunca aprendeu e não vai aprender até sábado.

E o custo é pior do que "entrega mal otimizada": quando o evento de otimização quase nunca acontece,
o Meta não tem sinal real para trabalhar e passa a entregar por modelagem/proxy — na prática, quase
às cegas. R$300/dia comprando isso é desperdício, e o Boss está certo em cortar.

> Ressalva que não muda a decisão: a Conversão Personalizada do leilão existir **dentro do pixel do
> perpétuo** não resolve a contaminação descrita no item 2 da lista (c). A regra do perpétuo
> (`URL contém obrigado E contém mql`) continua casando com `obrigado-saogeraldo-mql`. Aquela edição
> de 3 minutos continua valendo.

### 2. Trocar para qual evento — e por que NÃO a Conversão Personalizada ampla

Esta é a divergência. O Boss recomendou a conversão ampla (`URL contém obrigado-saogeraldo`,
MQL + lead comum). Minha posição é **Visualização da Página de Destino (LPV)**. O motivo é
aritmético, não de preferência.

**A régua:** Meta pede ~50 eventos de otimização por conjunto por 7 dias para sair do aprendizado.
Isso é documentação da plataforma. Convertendo para a janela: **~7 eventos por dia**.

**Os três candidatos, contra essa régua:**

| Evento | Volume diário | Projeção 7 dias | Sai do aprendizado? |
|---|---|---|---|
| `MQL-Sao-Geraldo` (atual) | subconjunto de 3 | menos que 21 | Não — nem perto |
| `obrigado-saogeraldo` (ampla) | 3 (total de leads) | **~21** | **Não** |
| Visualização da Página de Destino | não medido — ver abaixo | — | Sim, quase certamente |

- **MQL:** é um subconjunto dos 3 leads/dia. Não sei que fração, e não vou inventar uma — sei apenas
  que é **menor que 21 em 7 dias**. Impossível por qualquer caminho.
- **Conversão ampla `obrigado-saogeraldo`:** pega MQL + lead comum, ou seja, os 3 leads/dia
  inteiros. Isso dá **~21 eventos em 7 dias contra os ~50 necessários — menos da metade.** Triplicar
  o sinal em cima de uma base de 3/dia continua deixando o conjunto **dentro do aprendizado**. É por
  isso que eu discordo: a direção está certa, o resultado é o mesmo erro com um número menos ruim.
  E o prazo é ainda pior do que a tabela sugere — não temos 7 dias, temos **2**. Mesmo que os 50
  fossem alcançáveis em ritmo de 21/7d, eles chegariam depois do leilão.
- **LPV:** eu **não vi o número de LPV** desse conjunto — ele não estava no print. O que sustenta a
  recomendação é a ordem de grandeza: com R$300/dia entregando e uma landing que carrega em 0,26s
  (118KB), o volume de visualizações de página de destino está em outra escala que 3/dia. É o único
  dos três que passa dos ~7/dia com folga, e portanto o único que faz o conjunto sair do aprendizado
  e entregar de forma competente dentro da janela.

**O teste que falsifica minha posição, e vale 1 minuto:** abra a coluna de Visualizações da Página
de Destino dos últimos 3 dias. Se estiver **abaixo de ~7/dia**, eu estou errado sobre a escala — e
aí o problema deixa de ser evento de otimização e passa a ser **entrega**: R$300/dia não estariam
gastando, e nenhuma troca de evento conserta isso.

**O preço honesto da minha recomendação:** LPV é intenção fraca. Você compra visita, não lead — e
numa landing de 0,26s quase todo clique vira LPV, então na prática é otimização por tráfego. O que
compensa isso são os três mecanismos que já estão no plano: **qualificação explícita na copy**
(rebanho a partir de 100 cabeças), **geo** e o **LAL de `is_mql`**. Sem esses três, LPV vira volume
sem valor.

**E a conversão ampla não vai para o lixo: crie assim mesmo, como MEDIÇÃO.** Ela é o número que você
apresenta depois do leilão e a base de otimização da próxima campanha — o problema dela é só o
relógio de 2 dias, não o desenho. Num ciclo de 3–4 semanas ela seria a escolha certa, e a
recomendação do Boss estaria correta.

### 3. Editar o conjunto existente ou duplicar?

**Editar. Não duplicar.** Duplicar só se justifica quando há aprendizado a preservar no original — e
não há. Editando, você mantém os mesmos anúncios (e a prova social acumulada nos posts, que se perde
ao recriar) e, principalmente, **não parte R$600 entre dois conjuntos famintos**. Com esse total,
dividir mata os dois.

### 4. Divisão dos R$300/dia

**R$100/dia no conjunto de site (editado para LPV) + R$200/dia no Click-to-WhatsApp.**

O CTWA leva a maior parte porque é o único que gera **evento nativo em volume suficiente para o
algoritmo aprender de verdade dentro da janela** — conversas iniciadas não dependem do pixel nem do
formulário de 7 campos. Os R$100 mantêm vivo o caminho catálogo/formulário para quem prefere se
cadastrar, e continuam alimentando retarget e medição.

Reavalie **ao meio-dia de 31/07** e jogue tudo no que estiver produzindo.

> ⚠️ **Condição de execução:** se o WhatsApp Business ainda não estiver conectado à conta/página,
> **não queime 31/07 configurando isso**. Nesse cenário, tudo nos R$300 no conjunto de site com LPV
> e segue o plano.

---

## Adendo 30/07 (2) — o Formulário Instantâneo desalinhado muda a leitura

Contexto: `LEADS-INSTANTFORM-DESALINHADOS.md` (Trilho). Existe um **Formulário Instantâneo ativo** na
campanha do São Geraldo cuja entrega para o Google Sheets aponta para a aba **LEADS TOUROS**. 12 leads
pagos caem crus, no esquema do conector do Meta, e são invisíveis para a equipe. Continua vazando.

**Sim, muda — em quatro pontos.**

### 1. O conjunto otimiza por um evento que metade dos seus caminhos não consegue gerar

O local de conversão é **"Formulários no site e instantâneos"**, mas o evento de otimização
`MQL-Sao-Geraldo` é **Conversão Personalizada definida por URL** — e URL só existe no caminho de
site. **Nenhum lead de Formulário Instantâneo pode disparar esse evento, por construção.**

Ou seja: o Meta está sendo mandado buscar um evento que uma das suas duas rotas de entrega nunca
produz. Isso não substitui o diagnóstico de teto de conta (ver `RECONCILIACAO-SUBGASTO.md`), mas é
uma segunda fonte real de ineficiência, e explica por que os 12 leads não aparecem em lugar nenhum.

**Teste que confirma em 1 minuto:** no Gerenciador, compare a coluna de **conversões personalizadas
(`MQL-Sao-Geraldo`)** com a coluna **"Cadastros"/"Leads em formulário instantâneo"**. Se a segunda
tiver número e ele não estiver contido na primeira, está confirmado.

### 2. Parte do custo por lead que estamos calculando está contaminada — mas o número bom não está

- **O ~R$27 de CPL do caminho de site continua válido.** Ele foi derivado por multiplicação
  (CPC R$0,58 ÷ 61% clique→LPV ÷ 3,54% de conversão), não por divisão de gasto por leads. Instant
  Form não entra nessa conta.
- **O que fica suspeito é qualquer CPL/CPMQL obtido por gasto ÷ leads da planilha.** Faltavam 12
  leads na contagem, então o CPL real do conjunto é **melhor** do que o que apresentamos.
- **Não recalcule ainda.** O dry-run do `resgata-leads-instantform-saogeraldo.mjs` diz quantos dos 12
  são MQL pela régua (≥100 cabeças + IE). Só com esse número o CPMQL fecha. Refazer a conta antes
  disso é trocar um erro por outro.

### 3. O prejuízo real não é medição, é atendimento

12 leads pagos, a ~40h do leilão, que nenhum assessor ligou. Esses são os leads mais perecíveis da
conta inteira — depois de sábado às 12h eles valem uma fração. **O resgate é mais urgente que
qualquer ajuste de campanha deste plano.**

### 4. Revoga parte da minha recomendação original

Eu havia proposto **Formulário Instantâneo como fonte de sinal** no item (a) deste plano. Com o
destino quebrado, **abrir mais volume por essa rota multiplica leads invisíveis**. Duas saídas:

| Opção | Quando | Custo |
|---|---|---|
| **A — Reapontar o destino da entrega** do Instant Form (Meta ou ferramenta-ponte) | Se der para fazer hoje, em <15 min | Nenhum. É a correta |
| **B — Mudar o local de conversão do conjunto "Aberto" para "Site" apenas** | Se A não sair hoje | Perde a rota de baixa fricção, mas **estanca o vazamento na hora** e é 100% dentro do Gerenciador |

**Não deixe vazando por 40h enquanto a verba queima.** Se A não estiver resolvido até o save dos
cortes desta noite, faça B no mesmo save — já que o conjunto vai ser editado de qualquer forma, o
reset sai de graça.

E, decorrência: **o Click-to-WhatsApp só entra depois** de A ou B. Não se abre uma terceira rota
off-site enquanto a segunda está com o destino errado.
