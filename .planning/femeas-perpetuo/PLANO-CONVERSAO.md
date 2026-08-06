# Plano de conversão — landing do perpétuo de fêmeas

**A resposta em uma frase: nenhuma hipótese desta página é testável hoje, porque
o funil de fêmeas não tem um único dado — e a primeira entrega não muda a
página, ela liga a apuração.**

Escrito em **06/08/2026**, contra o código do dia. Toda taxa é **[MEDIDO]** (com
fonte) ou **[ASSUMIDO]** (com o que a mediria). Toda verificação é um comando ou
uma consulta, nunca "conferir se melhorou".

Este documento não repete o modelo do funil, a auditoria de medição nem o
registro de execução. Ele os usa:

| Para | Ler |
|---|---|
| As 5 taxas, a conta inversa, os sinais de falsificação | `MODELO-FUNIL.md` |
| O que a medição vê e o que ela não vê | `TESTE-GTM-2026-08-06.md` |
| Por que o formulário é assim (Desvios 3, 4, 5) | `EXECUCAO.md` |
| Como rodar qualquer verificação de página | `scripts/femeas/README.md` |

---

## 0. A regra que ordena o plano inteiro: uma taxa não basta

Esta página existe para **desqualificar**. O gargalo é hora de assessor, não
volume de lead (`MODELO-FUNIL.md §3`). Então "aumentar conversão" aqui **não é
maximizar formulários enviados** — um plano que suba `t_lp` derrubando `t_aprov`
piora o negócio e melhora o relatório.

A métrica que ordena tudo neste documento é o **produto das duas**:

```
t_util = t_lp × t_aprov          →  aprovados por 1.000 acessos
```

| Cenário | `t_lp` | `t_aprov` | aprovados/1.000 acessos | mídia por aprovado (CPC R$ 1,16) |
|---|---:|---:|---:|---:|
| Base do plano | 3,0% | 22% | **6,60** | R$ 176 |
| "Otimizou" t_lp, perdeu qualificação | 3,7% | 17% | **6,29** 🔴 | R$ 184 |
| Atrito a mais, tráfego a menos | 2,6% | 30% | **7,80** 🟢 | R$ 149 |
| t_lp a mais **sem** custo de qualificação | 3,4% | 22% | **7,48** 🟢 | R$ 155 |
| O análogo medido de touros | 3,0% | 12,9% | **3,87** | R$ 300 |

> ⚠️ **R$ 176/aprovado NÃO é o R$ 226,55 do `MODELO-FUNIL.md`.** Aquele mede
> CADASTRO OK no CRM de touros; este é mídia por lead aprovado pelo SDR de
> fêmeas, derivado de CPC × as duas taxas. **Nunca somar nem comparar os dois na
> mesma frase.**

**A linha 2 é o plano inteiro em um número.** Subir `t_lp` de 3,0% para 3,7% —
23% mais formulários, o relatório de mídia comemora — com uma queda de 5pp em
`t_aprov` **entrega menos aprovados e custa mais caro por aprovado**. E cobra
uma terceira vez, fora da tabela: são 23% mais toques de SDR para o mesmo
resultado, num time que a 12,9% já opera 1,6x acima da referência.

### O critério de aceite de qualquer hipótese deste documento

```
1. Declara explicitamente o efeito nas DUAS taxas. "Não sei" é resposta
   válida — "não se aplica" não é.
2. Tem verificação que é comando ou consulta.
3. Tem critério de reversão com número e prazo.
4. Se sobe t_lp: prova que não removeu nada que qualifica.
5. Se desce t_lp: prova que o que entrou qualifica.
```

---

## 1. O que a medição vê hoje — sete achados no código

Todos verificados em 06/08 lendo `src/app/femeas/`. Cada um vem com o comando
que o reproduz.

**1. Só o formulário emite evento. A página inteira é cega.**

```bash
node -e "const fs=require('fs');const d='src/app/femeas/_components';\
for(const f of fs.readdirSync(d)){const s=fs.readFileSync(d+'/'+f,'utf8');\
if(/from '\.\.\/_lib\/analytics'/.test(s))console.log(f)}"
# → Formulario.tsx     (e mais nada)
```

Rolagem, seções vistas, clique no CTA fixo, interação com o carrossel de
categorias, clique no link de escape para `/touros` — **nada disso existe para
a medição.** O único sinal de "a pessoa se envolveu com a página" é
`femeas_form_started`, que só dispara quando ela toca no primeiro campo.

**2. `femeas_step_reached` nunca é emitido para o passo 1.**

Em `Formulario.tsx`, `goNext()` emite `step_reached` com `ns + 1`, e `ns` já é o
passo seguinte. O primeiro `step_reached` que existe é `{step: 2}`. Quem montar
o funil com esse evento como denominador vai calcular o abandono do passo 1
dividindo por zero — ou pior, vai calcular certo por acaso e não saber.

**3. Não existe evento quando o servidor recusa ou cai.**

O `catch` do `handleSubmit` põe `status: 'error'` e não emite nada. Como o append
na planilha é **bloqueante de propósito** (`EXECUCAO.md`: 500 em vez de sucesso
silencioso), um problema no Google Sheets aparece na apuração exatamente igual a
uma desistência: `submit_attempt` sem `lead_submitted`. **Duas causas opostas,
mesma assinatura.**

**4. Os eventos de passo não carregam UTM.**

`femeas_view` e `femeas_lead_submitted` mandam as UTMs; `trackFunnel` (que emite
os quatro eventos de passo) manda só `{step, fields}`. Não há
`posthog.register()`. Consequência: **não dá para saber qual criativo traz quem
abandona no passo 1** — e essa é a segmentação que decide se o problema é a
página ou o anúncio.

**5. O `/saogeraldo` emite `touros_view` e `touros_lead_submitted`.**

```bash
node -e "const fs=require('fs');\
console.log(fs.readFileSync('src/app/saogeraldo/_lib/analytics.ts','utf8')\
.match(/touros_[a-z_]+/g))"
# → [ 'touros_view', 'touros_lead_submitted' ]
```

Os dois funis estão no mesmo balde no PostHog. **Não usar PostHog para o
benchmark de `t_lp` de touros** — o 3,9% do `MODELO-FUNIL.md` vem do cruzamento
GA4 × CRM, e é ele que vale. O fêmeas fez certo com prefixo próprio; herdar a
comparação do PostHog seria herdar a contaminação.

**6. Existe uma chave de junção entre comportamento e resultado, e ninguém a usa
ainda.**

```
crypto.randomUUID()  →  event_id (POST)  →  sheetLead.leadId  →  coluna "Lead ID" da aba FEMEAS
                     →  body.id          →  lead_id em femeas_lead_submitted (PostHog)
```

O mesmo identificador está na planilha e no PostHog. **É isto que permite ligar
`t_aprov` (coluna "Aprovado", preenchida pelo SDR) ao comportamento no site** —
qual criativo, quantos erros de validação, quanto tempo, que tamanho de texto no
campo projeto. Sem essa junção, "o atrito funciona?" é opinião. Com ela, é uma
consulta.

**7. O campo `projeto` exige 10 caracteres e comunica que espera 137.**

```bash
node -e "const s=require('fs').readFileSync('src/app/femeas/_lib/copy.ts','utf8');\
console.log(s.match(/placeholders:[\s\S]*?projeto:\s*\n?\s*'([^']*)'/)[1].length)"
# → 137
```

`PROJETO_MIN = 10` (espelhado em `Formulario.tsx` e na rota). "Quero começar no
PO" já passa. Mas o campo é um `textarea` de 4 linhas com `minHeight: 118` e um
placeholder de 137 caracteres que descreve um parágrafo inteiro. **O atrito real
desse campo não é a regra, é a expectativa que o desenho comunica** — e essa
discrepância não foi decidida, ela aconteceu. Muda a pergunta de C-01 (§4).

---

## 2. A ordem, e o que não pode ser invertido

A regra que estrutura tudo: **a amostra que decide C-01 tem que vir da página que
vai rodar.** Mudar a página no meio da coleta não atrasa a decisão — invalida a
amostra e obriga a começar de novo.

```
┌─ JANELA LIVRE — antes do primeiro real de mídia ────────────────────┐
│  Não há dado a proteger. Tudo que se pretende ter na versão que vai │
│  rodar entra AQUI.                                                   │
│                                                                      │
│  H-01  apuração do funil          (nada muda na página)             │
│  H-02  5 correções de instrumentação                                │
│  H-03  3 eventos de contexto                                        │
│  H-04  hero mais curto no celular  ← t_lp, custo zero de qualificação│
│  H-05  mini-filtro dentro do card  ← AUMENTA atrito, de propósito   │
└──────────────────────────────────────────────────────────────────────┘
                              ↓ congela
┌─ COLETA — dia 1 ao dia 14, no mínimo ───────────────────────────────┐
│  Nenhuma mudança de página. Nenhuma. Só tráfego e leitura diária do │
│  script de H-01 contra os sinais de falsificação do MODELO-FUNIL.   │
└──────────────────────────────────────────────────────────────────────┘
                              ↓ com 150 form_started E 60 aprovados
┌─ DECISÃO ───────────────────────────────────────────────────────────┐
│  H-06  C-01, o campo projeto      (§4 dá o limiar)                  │
│  H-07  recalibrar a régua          (matriz régua × Aprovado)         │
│  H-08  contador no campo projeto   (a primeira a cair)              │
└──────────────────────────────────────────────────────────────────────┘
                              ↓ só com verba
┌─ VOLUME ────────────────────────────────────────────────────────────┐
│  H-09  A/B da ordem do hero        (§5 dá o preço: R$ 4,8 mil)      │
└──────────────────────────────────────────────────────────────────────┘
```

### As cinco inversões que quebram o plano

1. **Tráfego antes de H-01/H-02.** Verba gasta sem medição não é reprocessável.
   Os primeiros 200 leads são a amostra mais cara que este funil vai ter — e é a
   única que responde `t_aprov`, o número que move a verba em 3x
   (`MODELO-FUNIL.md §2`).
2. **H-04/H-05 durante a coleta.** Se mudarem depois do dia 1, a janela reinicia.
3. **H-06 antes dos 150.** Decidir C-01 com 40 sessões é decidir por ruído com
   cara de dado. O default (`projeto` obrigatório) fica, e fica **por não haver
   número**, não por convicção — é o que o Desvio 5 já registra.
4. **H-07 antes da matriz de confusão.** Mexer na régua sem confrontá-la com a
   coluna "Aprovado" troca um chute por outro, e o custo é eficiência de mídia.
5. **As fotos da fazenda (gravação 14–15/08) entrando no meio da coleta.** Foto
   no hero é mudança de página como qualquer outra, e ela muda o
   `primeiroCampo`. **Ou a campanha sobe depois das fotos, ou a janela de C-01
   começa a contar do dia em que elas entrarem.** Não existe terceira opção que
   preserve a comparação.

---

## 3. As hipóteses, ranqueadas

Ranking por **(impacto esperado × confiança) ÷ custo**. A ordem de execução é a
do §2 e não é a mesma — H-01 é pré-requisito de quase tudo.

| # | Hipótese | `t_lp` | `t_aprov` | Custo | Confiança |
|---|---|---|---|---|---|
| 1 | **H-01** Apuração do funil | — | — | 1 arquivo novo | alta |
| 2 | **H-02** 5 correções de instrumentação | — | — | 2 arquivos, ~20 linhas | alta |
| 3 | **H-04** Hero mais curto no celular | ↑ | neutro | 1 componente | média |
| 4 | **H-05** Mini-filtro dentro do card | ↓ pouco | ↑ | 1 componente + copy | média |
| 5 | **H-03** 3 eventos de contexto | — | — | 3 componentes, ~25 linhas | alta |
| 6 | **H-07** Recalibrar a régua | neutro | ↑ (via mídia) | 3 linhas + consulta | baixa até haver dado |
| 7 | **H-06** Decidir C-01 | ↑ ou neutro | ↓ ou neutro | depende do veredito | — (é a decisão) |
| 8 | **H-08** Contador no campo projeto | ↑ pouco | risco ↓ | 3 linhas | baixa |
| 9 | **H-09** A/B da ordem do hero | ? | ? | R$ 4,8 mil de mídia | — |

---

### H-01 — Ligar a apuração do funil

**Move:** nenhuma taxa. **Habilita todas.** Sem isto, as outras oito hipóteses
são opinião com número inventado.

**O que muda no código:** um script novo, `scripts/femeas/apura-funil.mjs`, que
consulta o PostHog por HogQL (o padrão já existe em `src/actions/posthog.ts`, que
consulta o projeto 430113 com `POSTHOG_PERSONAL_API_KEY`) e imprime o funil
completo. **Nenhum arquivo de `src/app/femeas/` é tocado.**

**A regra que o script tem que respeitar, e que é o motivo de ele existir em vez
de se abrir o painel:**

```
CONTAR SESSÃO DISTINTA, NUNCA EVENTO.

femeas_validation_failed conta 3x quem errou 3 vezes no mesmo passo. Um
punhado de pessoas teimosas basta para o painel mostrar "80% de falha de
validação no passo 1" onde a verdade é 25%. Toda linha do funil usa
count(DISTINCT properties.$session_id).
```

As sete taxas que o script imprime, com o denominador de cada uma explícito —
porque é o denominador que se erra:

| Linha | Numerador | Denominador |
|---|---|---|
| Começou o formulário | `femeas_form_started` | `femeas_view` |
| Sobreviveu ao passo 1 | `femeas_step_reached{2}` | `femeas_form_started` |
| Sobreviveu ao passo 2 | `femeas_step_reached{3}` | `femeas_step_reached{2}` |
| Sobreviveu ao passo 3 | `femeas_step_reached{4}` | `femeas_step_reached{3}` |
| Tentou enviar | `femeas_submit_attempt` | `femeas_step_reached{4}` |
| **`t_lp`** | `femeas_lead_submitted` | **`femeas_view`** |
| Falha por campo | `validation_failed` por `fields` | sessões no passo |

> ⚠️ **`t_lp` tem que ter numerador e denominador do MESMO sistema.** Dividir
> `femeas_lead_submitted` (PostHog) por `page_view` do GA4 produz um número que
> não é taxa nenhuma: os dois sistemas perdem gente diferente (bloqueador,
> consentimento, momento do disparo). O GA4 serve de **conferência de ordem de
> grandeza**, nunca de denominador.

**Como se mede que funcionou:** o script é validado **contra dados que já
existem**, antes de haver um único evento de fêmeas. Trocando o prefixo
`femeas_` por `jmp_`, os números têm que bater com o painel `/adminjmp`
(`src/app/adminjmp/AdminJmpAnalytics.tsx`, que lê `getJmpPosthogAnalytics`). Se
baterem, a mecânica de consulta está certa no dia 1 de campanha, e não duas
semanas depois.

**A consulta de 30 segundos que decide se o resto é executável:**

```sql
SELECT event, count() AS eventos, count(DISTINCT properties.$session_id) AS sessoes
FROM events
WHERE event LIKE 'femeas_%' AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY event ORDER BY eventos DESC
```

**O que a derruba:** se essa consulta voltar vazia **com tráfego na landing**, a
ingestão do PostHog não está chegando e nada mais deste plano é executável — é a
condição que `EXECUCAO.md` já registra como bloqueante ("sem os eventos por
passo, C-01 não tem como ser decidida"). Nesse caso o plano inteiro tem uma
tarefa só, e ela não é minha.

---

### H-02 — Cinco correções de instrumentação no formulário

**Move:** nenhuma taxa. **É o que torna C-01 decidível.**

Cinco mudanças pequenas, todas em `_lib/analytics.ts` e `Formulario.tsx`:

| | O que | Por quê | Linhas |
|---|---|---|---|
| **a** | `femeas_step_reached {step:1}` no mount | Achado 2 do §1: o funil não tem primeiro degrau | 1 |
| **b** | `femeas_submit_failed {motivo}` no `catch` | Achado 3: hoje "o Sheets caiu" e "desistiu" têm a mesma assinatura | 2 |
| **c** | `posthog.register(utmProps)` no `initAnalytics` | Achado 4: sem isto, abandono não se segmenta por criativo | 1 |
| **d** | `femeas_campo_tocado {campo}`, 1x por campo por sessão | A curva de queda **dentro** do passo 1 — sem ela, C-01 não fecha | ~8 |
| **e** | `projeto_chars` em `femeas_lead_submitted` | O tamanho do texto, nunca o texto. É a métrica de qualidade mais barata deste funil | 1 |

**Sobre (e), que é o item que parece menor e não é:** o comprimento do campo
projeto, cruzado com a coluna "Aprovado" pela chave `Lead ID` (achado 6), responde
a pergunta que o funil inteiro faz — **o atrito comprou aprovação?** Se quem
escreve 200 caracteres aprova na mesma taxa de quem escreve 15, o campo é custo
puro e C-01 fecha sozinha.

**Sobre (d), que é o único com risco:** 12 campos × sessão é um evento por campo
tocado. Limitar a uma emissão por campo por sessão (um `Set` em `useRef`, mesmo
padrão do `startedRef` que já existe). **Se o volume de eventos virar problema,
(d) é o primeiro a sair** — é o mais caro e o mais específico da lista.

**Como se mede que funcionou:**

```bash
node scripts/femeas/medir-medicao.mjs
```

Tem que continuar mostrando `/femeas` **sem** `femeas_mql` e **sem**
`femeas_lead` no dataLayer. É o guarda do INV-2: nenhuma destas cinco pode
empurrar nada ao dataLayer, porque o acionador catch-all do container dispararia
Meta e GA4 a cada micro-evento (`TESTE-GTM-2026-08-06.md §4-bis`). Depois, a
consulta de H-01 tem que listar os três nomes novos.

**O que a derruba:** `medir-medicao.mjs` passar a mostrar qualquer evento novo no
dataLayer de `/femeas`. Reverter na hora — inflar PageView contamina a conta
inteira, não só esta landing.

---

### H-03 — Três eventos de contexto fora do formulário

**Move:** nenhuma taxa. **É o que separa "o problema é a página" de "o problema é
o formulário".**

| Evento | Onde | O que responde |
|---|---|---|
| `femeas_secao_vista {id}` | `ParaQuem`, `Categorias`, `Jornada`, `Fecho` | Quantos **veem o filtro** antes de preencher |
| `femeas_cta_ancora {origem}` | `StickyCta`, `Fecho` | O caminho de volta ao formulário é usado? |
| `femeas_escape_click` | o link `/touros` de `ParaQuem` | Quanta **receita do outro funil** esta página gera |

O `IntersectionObserver` já é padrão da página (`StickyCta.tsx`,
`CarrosselCategorias.tsx` usam). Um por seção, `threshold` baixo, dispara uma vez.

**Por que isto muda decisão e não é vaidade:** a tese da página é que **a copy
desqualifica antes do formulário** (`page.tsx`: "ParaQuem vem logo depois do hero
de propósito"). Mas o formulário está na primeira dobra, e o `primeiroCampo` no
celular é 763px numa tela de 844 — **a pessoa alcança o formulário sem nunca ter
rolado até o filtro.** Se a consulta mostrar que a maioria dos leads nunca viu
`#para-quem`, a tese está errada, todo o peso da qualificação está no formulário,
e H-05 deixa de ser opcional.

**Como se mede que funcionou:** consulta cruzando, por sessão, quem tem
`femeas_secao_vista{id:'para-quem'}` com quem tem `femeas_lead_submitted`; e
depois, pela chave `Lead ID`, a taxa de aprovação dos dois grupos.

**O que a derruba:** `femeas_escape_click` só faz sentido se o link levar para
uma URL confirmada — `paraQuem.escapeHref` ainda está marcado `[VALIDAR]` em
`copy.ts`. Se a URL mudar, o evento continua válido; se o link sair da página, o
evento sai junto.

---

### H-04 — Hero mais curto no celular: mover `hero.lead` para depois do formulário

**Move:** `t_lp` ↑. `t_aprov` **neutro** — nada que qualifica é removido.

**O estado medido** (`scripts/femeas/medir-pagina.mjs`, referência de 06/08):

```
1113 → antes de tudo
 950 → depois do carrossel de categorias
 763 → depois de a ficha técnica sair da frente   ← hoje
 633 → o /touros, que é o análogo e a meta
```

Faltam **130px**. O que está acima do formulário no celular, em ordem de DOM:
logo → eyebrow → manchete → **`hero.lead`** → `hero.ctaNote` → formulário.

**O que muda no código:** renderizar `hero.lead` duas vezes com visibilidade
trocada por breakpoint — exatamente o mecanismo que a `FichaTecnica` já usa em
`Hero.tsx`, com `hidden`/`sm:hidden`, que é `display:none` e portanto também tira
a cópia oculta da árvore de acessibilidade. No desktop nada muda; no celular o
parágrafo passa para depois do card, junto da ficha técnica.

**O que NÃO se mexe, e a distinção é o ponto:**

- **`hero.ctaNote` fica onde está.** É o aviso de que existe análise — o filtro
  trabalhando antes do primeiro campo. Tirá-lo é comprar `t_lp` com `t_aprov`,
  que é exatamente o que o §0 proíbe.
- **A manchete fica.** É a promessa, e sem ela o formulário aparece sem contexto.
- **`hero.lead` é argumento de reforço**, não filtro: nenhuma pessoa se
  desqualifica lendo "quem compra touro melhora o bezerro". É o mesmo raciocínio
  que já moveu a ficha técnica, e a ficha valeu 187px.

**Como se mede que funcionou:**

```bash
node scripts/femeas/medir-pagina.mjs
```

O `primeiroCampo` de `MOBILE 390` tem que **cair** de 763. Ganho esperado:
**110 a 140px** [ASSUMIDO — o número exato é o que o comando devolve]. E o
script tem que continuar sem ⚠️ nas quatro invariantes (1 formulário, 6 cartões,
9 critérios, sem rolagem lateral).

Depois de a atualizar, a linha `REFERENCIA['MOBILE 390'].primeiroCampo` do script
passa a ser o valor novo — senão o próximo a mexer no hero compara com um número
morto.

**O que a derruba:** o `primeiroCampo` não cair pelo menos 80px (não valeu a
mudança), ou qualquer invariante do script reprovar. Reverter é um `git revert`
de um componente.

⚠️ **Esta é a única hipótese de página cuja verificação é uma medida física, não
uma taxa.** Por isso ela pode ir na janela livre sem esperar dado: o
`medir-pagina.mjs` prova o efeito em pixels no mesmo dia. O que ela **não**
prova é o efeito em conversão — isso só a coleta responde, e é por isso que ela
entra **antes** do dia 1, não durante.

---

### H-05 — [AUMENTAR ATRITO] Mini-filtro de três linhas dentro do card

**Move:** `t_lp` ↓ pouco. `t_aprov` ↑. **É a hipótese que propõe atrito a mais, e
ela vem de uma conta, não de gosto.**

Pelo §0: `2,6% × 30% = 7,80` aprovados/1.000 acessos contra `3,0% × 22% = 6,60`.
**Perder 13% de `t_lp` para ganhar 8pp de `t_aprov` entrega 18% mais aprovados e
custa R$ 27 a menos por aprovado.** Se o atrito qualificar, ele paga.

**O que muda no código:** um bloco curto no topo do card do formulário, acima do
passo 1, com o texto vindo de `copy.ts` (INV-5 — zero string em componente). Três
linhas, condensando o que a seção `#para-quem` já diz, mais a saída digna:

```
É para quem quer criar Nelore PO registrado e vender genética com o
próprio nome.  ·  Não é para quem procura fêmea de gado comercial nem
dezenas de matrizes a preço de comercial.  →  [Ver a assessoria de touros]
```

O texto exato sai dos critérios já aprovados pelo João Antônio em
`paraQuem.sim[0]`, `paraQuem.nao[0]`, `paraQuem.nao[1]` e `paraQuem.escapeCta`.
**Não é copy nova — é a copy aprovada, no ponto de decisão.** ⚠️ A condensação
em si precisa passar por ele; é a mesma pendência da redação curta dos critérios
que `copy.ts` já registra como não lida.

**Por que aqui e não movendo `#para-quem` para antes do formulário:** a seção
inteira mede 1.421px no celular. Colocá-la antes do card levaria o
`primeiroCampo` de 763 para mais de 2.100px, e `t_lp` quase certamente cairia
abaixo de 2,1% — o sinal de falsificação do `MODELO-FUNIL.md §5`, o ponto em que
a landing de fêmeas converte pior que uma landing de leilão. **O mini-filtro
captura o efeito de desqualificação no ponto exato de decisão por ~80px em vez de
1.421px.** É a mesma alavanca por 6% do preço.

**Como se mede que funcionou:** duas coisas, e as duas são necessárias.

1. `node scripts/femeas/medir-pagina.mjs` — o `primeiroCampo` não pode subir
   mais de 90px (H-04 recupera 130; H-05 gasta parte disso, e o saldo tem que
   continuar negativo em relação aos 763 de hoje).
2. Na coleta: `femeas_escape_click` **dividido por** `femeas_view`, e o `t_aprov`
   dos leads da janela. Se o escape sobe e `t_aprov` sobe, o filtro está
   trabalhando.

**O que a derruba:** `t_lp` abaixo de **2,4%** na janela de 14 dias com o
`t_aprov` **sem** subir pelo menos 4pp. Nessa combinação o atrito está cobrando
sem entregar, e o bloco sai. (2,4% é uma margem de 0,3pp acima do sinal de
falsificação de 2,1% — parar antes de chegar nele, não depois.)

---

### H-06 — Decidir C-01: o campo `projeto`

**É a decisão mais cara deste funil, e ela tem seção própria.** Ver §4.

---

### H-07 — Recalibrar a régua com a matriz régua × Aprovado

**Move:** `t_lp` neutro (a régua não toca a página). `t_aprov` ↑ **pelo lado do
tráfego**.

A régua (`_lib/qualificacao.ts`) não filtra ninguém — ela escolhe a página de
obrigado e, por consequência, **o evento de conversão que a mídia aprende a
perseguir** (`femeas_mql` vs `femeas_lead`). Errar a régua custa eficiência de
mídia, não lead perdido; o próprio arquivo registra isso e adia a calibração
para quando houver dado.

**O dado é a matriz de confusão** entre a coluna "Régua automática" e a coluna
"Aprovado" da aba FEMEAS — as duas nascem lado a lado exatamente para isto
(`EXECUCAO.md`, Desvio 2).

| | Aprovado = Sim | Aprovado = Não |
|---|---|---|
| **Régua = Sim** | acerto | **falso positivo** — a mídia persegue lead ruim |
| **Régua = Não** | **falso negativo** — a mídia ignora lead bom | acerto |

**O candidato mais provável a entrar na régua:** `momento === 'Ainda estou
estudando o assunto'`. Quem responde isso dificilmente é aprovável agora, e hoje
ele sai com o mesmo sinal de conversão de quem já cria PO. Três linhas em
`REGRA_FEMEAS`, no mesmo formato de `quantidadesForaDaFaixa` — **sinal, nunca
recusa**: ele continua chegando ao SDR.

**Como se mede que funcionou:** a taxa de falso positivo cai na janela seguinte.

**O que a derruba, e é uma trava dura:** **não mexer na régua com menos de 60
leads que tenham a coluna "Aprovado" preenchida.** Abaixo disso, cada célula da
matriz tem menos de 15 casos e a diferença entre 20% e 35% de falso positivo é
ruído. E `minimoDeCabecas` continua `null` — é a única linha do arquivo que não
pode ser "otimizada" sem desfazer a decisão que a página inteira representa.

---

### H-08 — Contador de caracteres no campo `projeto`

**Move:** `t_lp` ↑ pouco. **`t_aprov` com risco de ↓.** É a hipótese mais fraca
da lista e a primeira a cair.

**A ideia:** o achado 7 do §1 — o campo exige 10 caracteres e comunica 137. Um
contador discreto reduz a percepção de esforço do campo mais caro do formulário.

**A tensão, e ela é real:** anunciar "mínimo 10 caracteres" convida a escrever 10
caracteres, e **o texto do projeto é o insumo nº 1 da triagem manual** — sem ele,
o SDR liga no escuro. Reduzir o atrito aqui é reduzir a qualidade da fila, que é
exatamente o tipo de troca que o §0 proíbe. Se for feita, o contador aparece
**depois** que a pessoa começa a digitar e **não anuncia o mínimo**.

**Como se mede que funcionou:** `projeto_chars` (de H-02e) na janela seguinte,
contra a janela anterior. E `t_lp`.

**O que a derruba — e este critério vale mesmo se `t_lp` subir:** a **mediana**
de `projeto_chars` cair abaixo de **60 caracteres**, ou mais de 20% dos envios
ficarem abaixo de 25 caracteres. Nessa faixa o campo virou formalidade e o SDR
perdeu o insumo — o `t_lp` a mais foi comprado com a qualidade da fila.

⚠️ **Se o tempo apertar, esta é a que sai.** Efeito pequeno, risco assimétrico e
o mesmo dado (`projeto_chars`) é entregue de graça por H-02.

---

### H-09 — A/B da ordem do hero

**Só existe com verba.** Ver §5 — o preço é R$ 4,8 mil de mídia e só detecta
mudanças de 50% ou mais.

---

## 4. C-01 — o limiar de decisão do campo `projeto`

`projeto` é obrigatório, mínimo 10 caracteres, e é o campo de maior risco de
abandono da lista. `EXECUCAO.md` (Desvio 5) já registra que **isto é uma decisão
na direção da tese, não um fato medido**. Este é o número que fecha a pendência.

### O achado que muda a pergunta

C-01 costuma ser enunciada como "manter, encurtar ou tornar opcional". Com o
achado 7 do §1 — **a regra pede 10 caracteres e o desenho comunica 137** — as
opções reais são quatro, e "encurtar o mínimo" não é uma delas (10 já é
praticamente nada):

| Opção | O que muda | Efeito no insumo do SDR |
|---|---|---|
| **A. Manter** | nada | intacto |
| **B. Baixar a expectativa** | `textarea` 4→2 linhas, placeholder curto | texto mais curto, ainda existe |
| **C. Mover para o passo 4** | mesmo campo, junto da formalização | intacto |
| **D. Tornar opcional** | deixa de bloquear | some para parte da fila |

⚠️ **Sobre a opção C, honestamente:** mover o campo para o fim não elimina o
abandono, **move o abandono para depois**. Hoje, quem desiste no passo 1 não era
lead e não custou nada; quem desistir no passo 4 desperdiça três passos já
investidos, e o formulário não salva parcial. A literatura de formulários diz
que o custo afundado reduz o abandono tardio — **mas isso não foi medido aqui**
[ASSUMIDO]. O que decide entre B e C é o dado de `femeas_campo_tocado` por passo,
que é justamente o que H-02(d) entrega.

### As duas taxas que decidem, com o denominador de cada uma

Todas as sessões contadas com `count(DISTINCT properties.$session_id)`.

```
culpa_projeto  =  sessões que falharam validação no passo 1 com 'projeto'
                  entre os fields E nunca alcançaram step_reached{2}
                  ─────────────────────────────────────────────────────
                  sessões com femeas_form_started que nunca
                  alcançaram step_reached{2}

                  → que fração do abandono do passo 1 é atribuível a ESTE campo


ganho_aprov    =  t_aprov dos leads com projeto_chars ACIMA da mediana
                  MENOS
                  t_aprov dos leads com projeto_chars ABAIXO da mediana

                  → em pontos percentuais. Junção pela coluna "Lead ID"
                    da aba FEMEAS × lead_id do femeas_lead_submitted
```

### O volume mínimo, e por que exatamente estes números

| Número | Para quê | Precisão que ele compra |
|---|---|---|
| **150** sessões com `femeas_form_started` | `culpa_projeto` | ±4,8pp em torno de 10%; ±6,9pp em torno de 25% |
| **60** leads com "Aprovado" preenchido | `ganho_aprov` | dois grupos de 30 — só detecta diferenças **grandes** (>20pp) |

150 sessões distinguem "5%" de "25%", que é a decisão. **Não** distinguem 10% de
14%, e não precisam: nenhuma faixa da tabela abaixo muda com 4pp.

⚠️ **Os 60 leads com veredito humano são a dependência frágil.** As cinco colunas
de operação nascem vazias e dependem de o SDR preenchê-las
(`MODELO-FUNIL.md §6`). **Se a coluna "Aprovado" ficar vazia, `ganho_aprov` não
existe e C-01 fecha só com metade da evidência** — decidindo pelo custo do campo
sem saber o valor dele. É a falha mais provável deste plano inteiro, e ela não é
técnica.

### A tabela de decisão

```
culpa_projeto < 25%                        → A. MANTER. O campo não é o gargalo do
                                              passo 1. C-01 fecha em "manter", com
                                              número. Reabrir só se t_lp < 2,4%.

25% ≤ culpa_projeto < 45%  E  ganho ≥ 15pp → B. BAIXAR A EXPECTATIVA. O campo custa
                                              e paga: textarea 4→2 linhas e
                                              placeholder curto. Reavaliar com mais
                                              150 sessões, olhando projeto_chars.

25% ≤ culpa_projeto < 45%  E  ganho < 15pp → C. MOVER PARA O PASSO 4. O SDR continua
                                              recebendo o texto; o abandono sai de
                                              antes do lead para depois dele.

culpa_projeto ≥ 45%        E  ganho < 5pp  → D. TORNAR OPCIONAL. Nesta faixa o campo
                                              derruba quase metade de quem começou e
                                              não compra aprovação nenhuma.

culpa_projeto ≥ 45%        E  ganho ≥ 15pp → NÃO DECIDIR AINDA. O campo é caro E
                                              valioso: é a única combinação em que
                                              vale gastar mais 150 sessões para
                                              separar B de C com precisão.
```

**Enquanto não houver 150 e 60, C-01 fica aberta e o campo fica como está.**
Manter o default sem dado é uma decisão defensável; mudá-lo sem dado, não —
porque a mudança destrói a linha de base sem produzir uma nova.

⚠️ **Se C-01 fechar em C ou D, `PROJETO_MIN` muda em DOIS lugares**:
`Formulario.tsx` e `src/app/api/femeas/lead/route.ts`. Eles não compartilham
import, e o próprio comentário do formulário avisa: se um mudar sem o outro, o
texto passa no browser e é recusado no servidor sem a pessoa entender o porquê.

---

## 5. O que NÃO testar, e a partir de que volume cada teste faz sentido

Teste A/B sem volume é ruído caro. O tamanho de amostra por braço, com poder de
80% e α de 5%, para uma base de `t_lp` = 3,0%:

| Lift relativo esperado | 3,0% vira | n por braço | Acessos totais | **Verba a CPC R$ 1,16** |
|---|---:|---:|---:|---:|
| 10% | 3,3% | 51.733 | 103.466 | **R$ 120.021** |
| 20% | 3,6% | 12.933 | 25.866 | **R$ 30.005** |
| 30% | 3,9% | 5.748 | 11.496 | **R$ 13.335** |
| **50%** | **4,5%** | **2.069** | **4.138** | **R$ 4.800** |
| 75% | 5,3% | 920 | 1.840 | R$ 2.134 |

> **O cenário-base do `MODELO-FUNIL.md` é 23.000 acessos/mês.** Um único A/B
> capaz de detectar 20% de lift consome **mais de um mês inteiro de tráfego** — e
> devolve uma resposta sobre uma mudança pequena. **Não existe A/B de `t_lp`
> neste funil abaixo de 50% de lift esperado.**

Para `t_aprov` (base 26%, o meio do intervalo defensável) é pior:

| Diferença a detectar | n por braço |
|---|---:|
| 5pp (26% → 31%) | 1.231 leads |
| 8pp (26% → 34%) | 481 leads |
| 13pp (26% → 39%) | 182 leads |

**`t_aprov` nunca se testa em A/B.** 481 leads por braço são 962 leads — mais de
um mês inteiro no cenário alto do modelo, para uma diferença de 8pp. `t_aprov` se
lê como **série temporal com o marco da mudança anotado**, e é por isso que o §2
proíbe duas mudanças na mesma janela.

### A metodologia que sobra, e ela é honesta sobre o que não prova

```
lift esperado < 30%   → antes/depois, UMA variável por vez, janelas de 14 dias.
                        O resultado é indicativo, não prova. Registrar como
                        indicativo — e não citar como se fosse prova depois.

lift esperado ≥ 50%   → A/B possível a partir de ~2.100 acessos por braço
                        (R$ 4,8 mil). Nenhuma hipótese do §3 promete isso,
                        exceto H-09.

t_aprov               → nunca A/B. Série temporal, marco anotado, uma
                        variável por janela.
```

### O que NÃO testar

**1. Formulário de 1 passo contra 4 passos.** Desfaz a decisão do cliente de
05/08 e a tese da página. O `Formulario.tsx` registra isso como o primeiro item
do "o que não fazer aqui", com o motivo: a recomendação genérica de encurtar
formulário resolve o problema **oposto** ao deste funil.

**2. Mover `#para-quem` para antes do formulário no celular.** Custa 1.421px de
rolagem antes do primeiro campo. `t_lp` provavelmente cai abaixo dos 2,1% do
sinal de falsificação, e 90% do efeito é capturado por H-05 por ~80px.

**3. Variantes de manchete.** `hero.titleVariants` tem três prontas, e é
tentador. Manchete move `t_lp` em faixa de 10–20% — que pela tabela custa
R$ 30 mil a R$ 120 mil para detectar. **Não testar antes de três meses de verba
no cenário alto.**

**4. Cor, texto ou tamanho do botão.** Efeito menor ainda que manchete, mesmo
preço de detecção.

**5. Remover o CPF/CNPJ ou a inscrição estadual.** São o que a régua julga e o
que habilita a compra em leilão. Removê-los desmonta `is_mql`, que é o sinal que
a mídia aprende. Se o dado mostrar que derrubam o funil, a resposta é **mover**
(como a opção C de C-01), nunca remover.

**6. Qualquer coisa enquanto a página muda por outro motivo.** A gravação da
fazenda é 14–15/08 e o hero tem dois encaixes de foto dormentes. Foto no hero
muda o `primeiroCampo` e muda a leitura da primeira dobra. Duas mudanças na mesma
janela produzem um resultado que não se atribui a nenhuma das duas.

**7. Reordenar os passos do formulário para capturar contato primeiro.** É o que
o `/touros` faz, e a inversão é deliberada aqui: quem não se reconhece no passo 1
tem que sair **antes** de virar lead. Testar isso é testar se a página deve
existir.

---

## 6. As três armadilhas que invalidam qualquer número deste plano

**1. Contar evento em vez de sessão.** Já dita em H-01, repetida aqui porque é a
que mais provavelmente vai acontecer: quem abrir o painel do PostHog e olhar a
contagem bruta de `femeas_validation_failed` vai ver um número inflado por quem
errou três vezes seguidas. **Toda taxa deste documento é por sessão distinta.**

**2. Numerador e denominador de sistemas diferentes.** `femeas_lead_submitted`
vive no PostHog; `femeas_mql`/`femeas_lead` vivem no GA4; `page_view` vive no
GA4. Misturar produz um número que parece taxa e não é. **`t_lp` sai inteiro do
PostHog.** O GA4 confere ordem de grandeza.

**3. A janela contaminada.** Toda comparação antes/depois deste plano precisa de
uma data de corte anotada. As mudanças previstas que cortam a janela: as fotos da
fazenda, qualquer revisão de copy do João Antônio (há copy pendente de leitura:
`form.consent`, as mensagens de erro, o placeholder do projeto, o bloco
`obrigado.comum` e a redação curta dos critérios) e qualquer alteração de
segmentação da campanha. **Anotar a data no momento em que acontece — reconstituir
depois nunca funciona.**

---

## 7. O que este plano depende e não controla

Três coisas. Nenhuma é tarefa deste documento; todas mudam o que ele entrega.

**1. O Meta não recebe evento nenhum.** Não é problema desta landing — o pixel
não dispara em página nenhuma do projeto, nem na landing de produção de touros,
nem o `PageView` que o próprio container manda disparar
(`TESTE-GTM-2026-08-06.md §4-ter`). **Enquanto isso não for respondido no
Gerenciador de Eventos, o GA4 é a única medição confiável deste funil** e a
campanha otimiza por tráfego, não por lead. Isso vale mais que qualquer hipótese
do §3: `t_aprov` move a verba em 3x, e a maior alavanca de `t_aprov` é o
algoritmo perseguir `femeas_mql` em vez de "qualquer cadastro".

**2. As cinco colunas de operação nascem vazias.** Se o SDR não registrar "1º
toque em" e "Aprovado", `t_aprov` não existe, H-06 fecha pela metade e H-07 não
acontece. É a única dependência humana do modelo e a mais provável de falhar.

**3. A copy do mini-filtro de H-05 precisa da leitura do João Antônio.** É
condensação de texto já aprovado, mas condensação é redação — e o filtro é o
produto desta página.

---

## Resumo operacional

**Nove hipóteses.** Cinco entram antes do primeiro real de mídia (H-01, H-02,
H-03, H-04, H-05); três esperam 150 sessões e 60 vereditos do SDR (H-06, H-07,
H-08); uma espera R$ 4,8 mil de verba dedicada (H-09).

**Duas aumentam atrito de propósito:** H-05 (mini-filtro no ponto de decisão) e
H-07 (o "ainda estou estudando" virando sinal na régua).

**A ordem que não se inverte:** medir → congelar → coletar 14 dias → decidir.
E a data das fotos da fazenda corta a janela: ou a campanha sobe depois delas, ou
o relógio de C-01 começa a contar quando elas entrarem.

**A primeira coisa na segunda de manhã:** rodar a consulta de 30 segundos de
H-01 — `SELECT event, count() FROM events WHERE event LIKE 'femeas_%'` — para
saber se a ingestão do PostHog chega. Seja qual for a resposta, escrever
`scripts/femeas/apura-funil.mjs` no mesmo dia e validá-lo trocando o prefixo por
`jmp_`, contra dados que já existem. **É o único trabalho deste plano que não
pode ser feito depois:** no dia 1 de campanha, ou o número existe ou aquele dia
de verba não vira aprendizado nenhum.

**A primeira a abandonar se o tempo apertar:** H-08, o contador de caracteres.
Efeito pequeno, risco assimétrico sobre o insumo do SDR, e o dado que ela
justificaria (`projeto_chars`) já vem de graça em H-02.
