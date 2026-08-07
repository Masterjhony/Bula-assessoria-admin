# Item 7.1 — as 12 linhas desalinhadas na LEADS TOUROS

**Data:** 30/07/2026 · **Frente:** infra & tracking
**Veredito: H2. Não é o nosso código. É despejo cru do conector do Meta (Formulário Instantâneo).**

---

## 1. A prova: as três células batem casa por casa

Cabeçalho real da aba **LEADS TOUROS** — `TOUROS_HEADER` (`jmp-sheets.ts:1610`) com **`Etapa`
inserida como coluna A** (commit `f217218`: *"vai inserir 'Etapa' como coluna A"*):

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Etapa | Atendido por | Data | Nome | WhatsApp | E-mail | UF | Zona |

Layout do despejo CRU do Meta — lido de `parseRawMetaLead()` (`jmp-sheets.ts:448-466`), que existe
justamente para interpretar esse formato:

| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| `l:<id>` | created_time | `ag:<ad_id>` | ad_name | `as:<adset_id>` | adset_name | `c:<campaign_id>` | campaign_name |

Sobrepondo um no outro:

| Coluna da aba | Recebe do despejo | Relatório diz |
|---|---|---|
| **A — Etapa** | `l:<id>` | `l:1077242948066252` ✅ |
| **B — Atendido por** | created_time | `2026-07-29T14:16:55-05:00` ✅ |
| C — Data | `ag:<ad_id>` | — |
| D — Nome | ad_name | — |
| E — WhatsApp | `as:<adset_id>` | — |
| F — E-mail | adset_name | — |
| G — UF | `c:<campaign_id>` | — |
| **H — Zona** | campaign_name | `LEADS - SAO GERALDO` ✅ |

**Três de três, na posição exata.** Não é coincidência de formato: é a mesma linha, deslocada por
estar num esquema diferente.

### Previsão falseável — confira em 10 segundos e a prova fecha

Se o modelo acima estiver certo, nas mesmas 12 linhas você vai ver:

- **Nome** contendo um **nome de anúncio**, não um nome de pessoa;
- **WhatsApp** começando com **`as:`**;
- **UF** começando com **`c:`**;
- **Data** começando com **`ag:`**.

Se qualquer uma dessas quatro não bater, me chame — o modelo está errado e o diagnóstico volta para
a mesa. É exatamente o teste barato que você pediu: **a linha inteira está em outro esquema**, os
campos de contato NÃO estão no lugar certo. Logo, H2.

---

## 2. Por que H1 está descartada — quatro fundamentos independentes

1. **Não houve mudança de código em 29/07.** O último commit do repositório é `2559d75`, de
   **28/07 15:28**. `git log --since=2026-07-28 --all` não devolve nada depois disso. A causa
   atribuída pelo relatório não existe na linha do tempo.
2. **`jmp-sheets.ts` não é tocado desde `c4aafde`** (a entrada da landing). Nada no caminho de
   escrita mudou na janela.
3. **Nosso caminho não escreve nessa aba.** `route.ts:165` chama `appendLeadToSaoGeraldoTab()`, que
   grava em `LEADS_SAO_GERALDO_TAB` (`jmp-sheets.ts:1925`). A LEADS TOUROS não está no caminho.
4. **Nosso código não consegue desalinhar coluna.** Todo escritor resolve célula **pelo nome do
   cabeçalho**, nunca por posição — `buildTourosRow` via `layout.indexes`, `buildNormalizedMetaRow`
   via `set(header, value)`. Um deslocamento de uma coluna é impossível por construção. Some-se:
   o código **nunca escreve na Etapa** (`f217218`: *"O codigo nao escreve na Etapa: coluna da
   equipe"*), e nunca produz os prefixos `l:` / `ag:` / `as:` / `c:` — eles são do conector, e o
   `stripPrefix()` existe só para removê-los na LEITURA.

E o comportamento já está documentado no próprio arquivo (`jmp-sheets.ts:634`):
*"O conector do Meta despeja os leads crus/desalinhados e — segundo quem configura o Meta — não há
como entregar formatado."* O que é novo não é o despejo cru; é o **destino**.

---

## 3. Causa raiz e quem conserta

O conjunto do São Geraldo tem local de conversão **"Formulários no site e instantâneos"**. A entrega
do Formulário Instantâneo para Google Sheets foi apontada para a aba **LEADS TOUROS** em vez da aba
bruta que o normalizador varre. Resultado: 12 leads pagos, crus, invisíveis — não aparecem para
assessor nenhum porque nem o nome está na coluna Nome.

**O conserto da origem não é código e não é meu:** é reapontar o destino da integração do Formulário
Instantâneo no Meta (ou na ferramenta que faz a ponte). Exige o dono da conta. **Enquanto não for
reapontado, cada novo lead de Instant Form continua caindo desalinhado** — inclusive nas próximas
40h, que é quando a verba está queimando.

---

## 4. O resgate das 12 — `scripts/resgata-leads-instantform-saogeraldo.mjs`

Dry-run por padrão, no mesmo padrão do `adiciona-coluna-etapa-touros.mjs`. **Não rodei**: não tenho
`.env.local` nem credencial do Google aqui.

```
node scripts/resgata-leads-instantform-saogeraldo.mjs              # dry-run: só mostra
node scripts/resgata-leads-instantform-saogeraldo.mjs --apply      # grava
```

O que faz:
1. Lê a LEADS TOUROS e isola as linhas cruas (coluna A casa `l:<n>` **e** coluna B é timestamp ISO).
2. Imprime **cada linha com índice posicional** (`[13] "100 a 500 cabeças"`).
3. Monta a linha normalizada e grava na **LEADS SAO GERALDO**, resolvendo tudo por cabeçalho.
4. **Idempotente pelo `id` do Meta** — que é estável, ao contrário do nosso `event_id`. Rodar duas
   vezes não duplica.
5. Calcula o MQL pela mesma régua (≥100 cabeças + IE) e imprime o veredito de cada um.
6. **Não apaga nada.** Imprime os números das linhas cruas na LEADS TOUROS para você apagar à mão.

### Por que LEADS SAO GERALDO e não as abas dos assessores

São leads da campanha do lançamento (`campaign_name = LEADS - SAO GERALDO`). A aba do lançamento é,
por decisão registrada, **o registro único do funil e não é dividida por assessor** — *"o leilão é
evento de janela curta, atendido pela equipe inteira"* (`jmp-sheets.ts:1907`). Jogá-los nas abas de
Douglas/João contaminaria o funil do perpétuo, que é exatamente o que a `route.ts:58-61` evita de
propósito. Assim eles ficam visíveis para a equipe inteira, que é o que o item 7.2 pede.
Se você preferir roteamento por UF, é trocar o destino por `tourosTabDaUF(uf)` — uma linha.

### A ressalva que você precisa ler antes do `--apply`

As posições 12 a 21 do despejo cru são as **respostas do formulário**, e a ordem delas depende de
como CADA formulário instantâneo foi montado. O mapa que uso por padrão é o do formulário do
perpétuo (momento, cabeças, IE, interesse, qtd, nome, e-mail, telefone, UF). **O formulário do São
Geraldo pode ter outra ordem.** É por isso que o dry-run imprime a linha crua indexada: confira se
`[17]` é mesmo nome de gente e `[19]` é mesmo telefone antes de gravar. Se estiver trocado, ajuste
`MAPA` no topo do script — está isolado lá justamente para isso.

---

## 5. O que fica em aberto, e é seu

- [ ] **Reapontar a entrega do Formulário Instantâneo** no Meta. Sem isso o vazamento continua.
- [ ] Confirmar a previsão do §1 (4 células) antes do `--apply`.
- [ ] Conferir o mapa de posições 12-21 no dry-run.
- [ ] Depois do resgate: apagar as 12 linhas cruas da LEADS TOUROS (o script diz quais).
