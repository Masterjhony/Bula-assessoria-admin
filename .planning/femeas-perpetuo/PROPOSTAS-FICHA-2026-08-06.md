# Ficha técnica do hero /femeas — três propostas de tratamento

**Data:** 06/08/2026
**Pedido do dono, literal:** *"esse 30 vezes no boleto, frete grátis e zero reais custo de assessoria tá horroroso. Procura um design em tópicos melhor, SEM EMOJI, SEM ÍCONE."*
**Restrições duras:** zero ícone/emoji/SVG · canto reto + filete 1px · tokens de `_lib/tokens.ts` · AA sobre `#0D0D0D` · valor ≤ ~26px (não competir com a manchete de `clamp(38px,6.2vw,68px)`) · `primeiroCampo` do celular não pode crescer · 390px e 1440px.

Tudo abaixo foi **medido no navegador** (Playwright, fonte já carregada, `document.fonts.ready`) contra o servidor de dev em `localhost:3000/femeas`. Nada foi estimado.

---

## 0. Duas coisas antes das propostas

### 0.1 O arquivo já mudou no disco — e a faixa já está lá

Quando li `Hero.tsx` pela primeira vez nesta sessão, `FichaTecnica` era o empilhamento de três linhas com as marcas SVG. Ao medir a página viva, o DOM renderizado era outro: **outro terminal já trocou a ficha por uma faixa de três colunas com filete de 1px**, sem SVG. A classe viva é `grid grid-cols-3` (celular) / `sm:grid sm:grid-cols-3` (desktop), valor em `clamp(18px, 2.2vw, 26px)`, rótulo em `clamp(10px, 1vw, 11px)`.

Ou seja: a hipótese que este documento foi encarregado de testar **já está implementada**. O que sobra de útil não é "e se fosse faixa", é **"a faixa que está lá está calibrada certo?"**. Não está, e o motivo é o item seguinte.

### 0.2 O comentário que justifica os 18px está medindo a coisa errada

O comentário atual em `Hero.tsx` diz:

```
390px    "Frete grátis"  97px   coluna de 118px   folga 21px
1440px   "Frete grátis" 150px   coluna de 195px   folga 45px
```

e conclui que 18px é "a largura que existe".

Os 97px e os 150px **não são a largura do texto**. O `<span>` do valor tem `display: block` — a caixa dele sempre mede a largura do content-box da célula, independentemente do que está escrito dentro. O que foi medido foi a própria célula; a "folga de 21px" é o `padding` da célula, não sobra nenhuma.

A largura real dos **glifos** de "Frete grátis" em Oswald 600, `letter-spacing: -0.015em`, medida com `white-space: nowrap` num span de largura intrínseca:

| tamanho | 18px | 20px | 21px | 22px | 23px | 24px | 26px |
|---|---|---|---|---|---|---|---|
| "Frete grátis" | 79,7 | 88,6 | 93,0 | 97,5 | 101,9 | 106,3 | 115,2 |
| "30x" | 25,8 | 28,7 | 30,1 | 31,6 | 33,0 | 34,4 | 37,3 |
| "R$ 0" | 32,5 | 36,1 | 37,9 | 39,7 | 41,5 | 43,3 | 46,9 |

A 18px sobram **18,4px** na coluna, não 21. E a 22px ainda cabe. O teto de 18px é artefato de medição, não da fonte.

*(O comentário acerta ao avisar "meça no navegador, não no canvas" — e depois mede um `display:block`, que tem exatamente o mesmo defeito: devolve um número que não é o do texto.)*

---

## 1. A resposta direta: "Frete grátis" cabe em ~116px de coluna?

**Cabe, e com folga — até 22px. O teto absoluto é 23px. A 24px quebra.**

Geometria real em 390px (medida, não calculada): o container do hero tem `padding` de 17,5px de cada lado → **355px de conteúdo**. Menos os dois filetes de 1px → 353px para três colunas → **117,7px de coluna bruta**.

O que sobra para o texto depende de *como* as três colunas são construídas, e aqui está o achado que muda o resultado:

| construção | útil col. 1 | útil col. 2 | útil col. 3 |
|---|---|---|---|
| `grid grid-cols-3` + padding por célula (**o que está no ar hoje**) | 108,2 | **98,1** | 108,2 |
| `flex-1` (`flex: 1 1 0`) + padding por célula | **103,0** | **103,0** | **103,0** |

Com `grid-cols-3` as três faixas medem 118,33px iguais, mas a do meio paga recuo dos **dois** lados e as das pontas de um só. Resultado: **a coluna que carrega o valor mais longo é a mais estreita das três** — 10px a menos que as vizinhas. Com `flex-1` a distribuição sobra sobre o padding e os três content-boxes saem idênticos.

Conta final com a geometria `flex` (recuo de 11px em 390px):

```
útil por coluna       103,0 px
"Frete grátis" @22px   97,5 px   →  folga  5,5 px   ✅
"Frete grátis" @23px  101,9 px   →  folga  1,1 px   ⚠️ teto absoluto
"Frete grátis" @24px  106,3 px   →  estoura 3,3 px  ❌
"Frete grátis" @26px  115,2 px   →  estoura 12,2 px ❌
```

Com a geometria `grid` de hoje (98,1px úteis) o teto cai para **21px** — 22px estoura por 0,15px. Trocar `grid-cols-3` por `flex-1` compra literalmente **4px de tipo de graça**, sem um pixel de altura.

### Onde a faixa fica mais apertada não é o celular — é 1024px

Medido varrendo a largura da janela com a grade `lg` real:

| largura | coluna útil | valor renderizado | glifos | folga |
|---|---|---|---|---|
| 320 | 80,7 | 20px | 88,6 | **−7,9 ❌** |
| 344 | 88,7 | 20px | 88,6 | 0,1 ⚠️ |
| 360 | 94,0 | 20,2px | 89,3 | 4,7 ✅ |
| 375 | 99,0 | 21px | 93,0 | 6,0 ✅ |
| **390** | 104,0 | 21,8px | 96,8 | **7,3 ✅** |
| 640 | 180,3 | 22px | 97,5 | 82,9 ✅ |
| 768 | 221,3 | 22px | 97,5 | 123,8 ✅ |
| **1024** | 128,1 | 22px | 97,5 | **30,6 ✅** |
| 1280 | 171,0 | 23,0px | 102,1 | 68,9 ✅ |
| **1440** | 168,3 | 25,9px | 114,8 | **53,5 ✅** |

Em 1024px a grade `lg` já entrou e o card do formulário come 468px fixos: a coluna de promessa despenca para 440px e a coluna da ficha para 128px úteis — **mais estreita que em 768px**. Qualquer `clamp()` puramente em `vw` cresce o valor justamente onde a coluna encolheu. Foi o que a primeira versão desta proposta fez (teto de recuo em 22px + valor em `clamp(22px,1.8vw,26px)`): deu 4,9px de folga em 1024. Baixando o teto do recuo para 20px, sobem para 30,6px.

**Piso medido da faixa: 345px de janela.** Abaixo disso "Frete grátis" não cabe num terço da tela em nenhum tamanho que não seja ridículo. O `clamp` proposto tem piso de 18px justamente para 320px não estourar (a 18px são 79,7px contra 80,7 úteis — passa raspando, e acima de 322px o piso nem é acionado).

### Contraste — medido, não presumido

Amostrei o pixel real de fundo atrás da faixa (screenshot + `sharp`, com a foto do hero ligada):

| largura | fundo p50 | fundo p90 | rótulo `#B0B0B0` vs p90 |
|---|---|---|---|
| 390 | `rgb(13,13,13)` | `rgb(26,26,26)` | **8,03:1** |
| 768 | `rgb(14,14,14)` | `rgb(16,16,15)` | **8,78:1** |
| 1440 | `rgb(19,17,15)` | `rgb(27,25,23)` | **8,08:1** |

A foto não chega à ficha em contraste útil em nenhum dos três. AA (4,5:1) passa com o dobro de margem; AAA (7:1) também. **O rótulo pode subir de 10px para 11px sem custo de acessibilidade** — e 11px é o que `typo.monoLabel` já define.

---

## 2. As três propostas

Assinatura idêntica nas três: `FichaTecnica({ className }: { className: string })`, consumindo `hero.stats`. Nenhuma usa SVG, ícone, emoji, gradiente, sombra ou raio > 0. Nenhuma importa `MARCAS_FICHA`.

⚠️ **As três exigem trocar as duas strings de `className` nas chamadas** (as classes de layout `grid grid-cols-3` / `flex flex-col gap-[20px]` deixam de fazer sentido, porque o arranjo passou para dentro do componente). As strings novas vêm junto de cada proposta.

---

### A — FAIXA · *três colunas divididas por filete, iguais por construção*

> Uma barra só, lida da esquerda para a direita como o rodapé de um contrato: três condições numa linha de base comum, separadas por dois filetes de 1px, com as três colunas de texto exatamente do mesmo tamanho.

```tsx
// ─────────────────────────────────────────────────────────────────────────
// FICHA TÉCNICA — 30x · frete · custo da assessoria.
//
// UMA FAIXA, TRÊS COLUNAS, DOIS FILETES. O empilhamento anterior era o defeito:
// três condições uma embaixo da outra, mesmo peso e mesmo alinhamento, são três
// objetos — o olho conta três paradas e nenhuma justifica a parada. Em coluna
// única elas viram um objeto só, e a linha de base comum dos três valores é o
// que faz o olho ler UMA vez em vez de três.
//
// ⚠️ `flex-1` E NÃO `grid-cols-3`, e isto é medida, não preferência. Com
// `grid grid-cols-3` as três faixas medem igual (118,3px em 390), mas a do meio
// paga recuo dos DOIS lados e as das pontas de um só — a coluna útil vira
// 108,2 / 98,1 / 108,2. A coluna mais estreita passa a ser justamente a que
// carrega o valor mais longo ("Frete grátis"). Com `flex: 1 1 0` a sobra é
// distribuída DEPOIS do padding e os três content-boxes saem em 103,0 / 103,0 /
// 103,0. São 4px de tipo de graça, sem um pixel de altura.
//
// ⚠️ O VALOR TEM ORÇAMENTO DE ~12 CARACTERES. Medido com a Oswald real:
//
//   "Frete grátis"  @20px  88,6px   @22px  97,5px   @23px 101,9px   @24px 106,3px
//   coluna útil     390px 103,0    360px  94,0     1024px 128,1
//
// A 24px estoura em 390. Como o valor é `nowrap` (a linha de base comum é a
// única coisa que faz três colunas lerem como um objeto), texto novo mais longo
// que ~12 caracteres TRANSBORDA em silêncio — não quebra, não rola a página,
// só encosta no filete vizinho. Quem editar `hero.stats` mede antes.
//
// ⚠️ O PONTO MAIS APERTADO DA PÁGINA É 1024px, NÃO O CELULAR. Ali a grade `lg`
// já entrou e o card do formulário fixa 468px: a coluna de promessa cai para
// 440px e a coluna da ficha para 128px úteis — mais estreita que em 768px. É
// por isso que o recuo tem TETO de 20px e o valor cresce em 1,8vw e não em
// 2,4vw: com teto de 22px a folga em 1024 caía de 30,6px para 4,9px.
//
// ⚠️ `minHeight: 2.7em` NO RÓTULO reserva duas linhas SEMPRE. "Custo da
// assessoria" mede 154,7px em mono 11px e não cabe nos 103px do celular nem nos
// 128px de 1024 — ele quebra em duas, e sem a altura reservada as outras duas
// células terminariam mais alto. Três colunas com pés diferentes é exatamente o
// "desconfigurado" que derrubou os pictogramas das categorias. O custo é uma
// linha vazia reservada acima de ~1280px, onde o rótulo caberia numa linha só:
// 15px de espaço em troca de um pé único em TODAS as larguras.
//
// ⚠️ CONTRASTE MEDIDO com a foto ligada (amostragem do pixel real de fundo):
// `dark.muted` sobre o fundo composto dá 8,03:1 em 390, 8,78:1 em 768 e 8,08:1
// em 1440. AA pede 4,5:1. Foi essa medida que liberou o rótulo a subir de 10px
// para 11px, que é o que `typo.monoLabel` já define.
// ─────────────────────────────────────────────────────────────────────────

// Recuo de cada lado do filete divisor. O teto de 20px é a trava de 1024px
// descrita acima — não subir sem refazer aquela medida.
const FAIXA_RECUO = 'clamp(11px, 1.6vw, 20px)'

function FichaTecnica({ className }: { className: string }) {
  return (
    <div className={className} style={{ borderTop: `1px solid ${dark.hairline}` }}>
      <div className="flex items-stretch">
        {hero.stats.map((s, i) => (
          // A COLUNA É A CÉLULA. O divisor é a borda esquerda de quem não é o
          // primeiro — dois filetes para três colunas, que é o mínimo que
          // divide. Filete em volta de cada célula daria seis.
          //
          // O `pt` mora AQUI e não no wrapper de propósito: com ele na célula, o
          // filete vertical nasce colado no filete de topo e a faixa lê como uma
          // grade. No wrapper, os divisores começam 22px abaixo e ficam boiando.
          <div
            key={s.label}
            className="min-w-0 flex-1 pt-[18px] sm:pt-[clamp(22px,2.4vw,30px)]"
            style={{
              borderLeft: i === 0 ? undefined : `1px solid ${dark.hairline}`,
              paddingLeft: i === 0 ? 0 : FAIXA_RECUO,
              paddingRight: i === hero.stats.length - 1 ? 0 : FAIXA_RECUO,
            }}
          >
            {/* Piso de 18px só para 320px não estourar (79,7px de glifos contra
                80,7px úteis). Acima de 322px o piso nem é acionado — quem manda
                é o 5,6vw, que é a taxa em que a própria coluna cresce. */}
            <span
              className="block text-[clamp(18px,5.6vw,22px)] sm:text-[clamp(22px,1.8vw,26px)]"
              style={{
                fontFamily: font.display,
                fontWeight: 600,
                letterSpacing: '-0.015em',
                lineHeight: 1.1,
                color: dark.text,
                whiteSpace: 'nowrap',
              }}
            >
              {s.value}
            </span>
            <span
              className="mt-[9px] block sm:mt-3"
              style={{
                ...typo.monoLabel,
                fontSize: 11,
                lineHeight: 1.35,
                minHeight: '2.7em',
                color: dark.muted,
                overflowWrap: 'break-word',
              }}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Chamadas (substituir as duas strings em `Hero.tsx`):**

```tsx
{/* desktop — ancora o pé da coluna de promessa */}
<FichaTecnica className="hidden sm:mt-auto sm:block" />

{/* celular — depois do formulário */}
<FichaTecnica className="mt-[clamp(28px,5vw,40px)] sm:hidden" />
```

**Por que resolve o "horroroso"**

- **Ritmo.** O empilhamento pedia três paradas do olho, nenhuma delas importante o bastante para justificar uma parada. Em faixa é uma parada só: os três valores dividem a mesma linha de base e são varridos num movimento horizontal. O bloco deixa de ser uma lista e passa a ser um objeto.
- **Alinhamento.** Duas arestas duras novas: a linha de base dos três valores e a linha de base dos três rótulos. Os filetes verticais dão uma terceira. Não sobra nenhuma borda serrilhada — que era o que fazia o bloco ler como formulário.
- **Hierarquia.** O valor não cresce para brigar com a manchete: em 390 ele fica em 21,8px contra 38px da manchete (1,74×); em 1440, 25,9px contra 68px (2,63×). O que dá peso ao bloco não é escala, é *agrupamento* — a moldura implícita das três colunas.
- **Densidade.** 77,7px de altura em 390 contra 165px do empilhamento original. Metade do espaço para a mesma informação, e o argumento passa a caber inteiro no campo de visão.

**O que custa**

| | 390 | 768 | 1440 |
|---|---|---|---|
| altura do bloco | **77,7px** | 83,9px | 88,2px |
| `primeiroCampo` | 537 (inalterado) | 700 (−1) | 399 (inalterado) |
| rolagem lateral | não | não | não |

- **Risco em 390px:** nenhum medido — 7,3px de folga no valor mais longo, 0 de estouro, sem rolagem lateral. O piso real é **345px de janela**; abaixo disso a faixa não fecha.
- **Se o texto do cliente crescer:** é a mais frágil das três. O valor é `nowrap` e o orçamento é de **~12 caracteres** (104px úteis ÷ 8,1px por caractere a 22px). "30x sem juros" (13) já transborda 11px em 390 — testado. O rótulo degrada bem (quebra em duas linhas, e a altura já está reservada); o valor, não.
- **O que some:** as marcas SVG e, com elas, os 3% de área não-texto que a régua da página pedia. A justificativa nova é que a régua mede *seção*, e a seção aqui é o hero inteiro — que paga sozinho (2,38× de razão tipográfica, 27% de imagem).

---

### B — PAUTA · *coluna de valor de largura fixa, filete entre as linhas*

> Continua empilhada, mas com **duas margens esquerdas duras**: os três valores começam na mesma coluna e os três rótulos começam noutra, também a mesma — o serrilhado desaparece sem faixa nenhuma.

```tsx
// ─────────────────────────────────────────────────────────────────────────
// FICHA TÉCNICA — três linhas, DUAS ARESTAS.
//
// O defeito do empilhamento nunca foi a vertical: foi que só existia UMA aresta
// (a margem esquerda dos valores). Como valor e rótulo ficavam colados com 10px
// entre eles, os rótulos começavam em três x diferentes — 52, 118 e 60 em 390 —
// e três inícios diferentes na mesma coluna é o que o olho lê como bagunça.
//
// A coluna fixa do valor cria a segunda aresta. Os três rótulos passam a nascer
// no mesmo x, e o bloco ganha a régua que o filete tentava dar.
//
// ⚠️ ISTO NÃO É A VOLTA DO `justify-between` REPROVADO. Lá o rótulo ia contra a
// margem OPOSTA, com ~330px de nada no meio de um iPhone, e a proximidade
// quebrava (valor e rótulo são UM dado). Aqui o vão é de 14–20px depois de uma
// coluna dimensionada para o valor mais longo — 104px em 390, que é exatamente
// "Frete grátis" a 22px (97,5px) mais 6,5px de respiro. O vão residual do valor
// mais CURTO ("30x", 31,6px) é de ~85px, e esse é o preço honesto desta
// proposta: uma coluna fixa cobra do item curto o espaço do item longo.
//
// ⚠️ SÃO TRÊS FILETES, NÃO QUATRO. Um de topo (abre o bloco) e dois entre as
// linhas. Filete embaixo da última fecharia uma caixa, e caixa é tabela — foi o
// que já derrubou uma rodada anterior deste mesmo bloco.
//
// ⚠️ O VALOR NÃO É `nowrap` AQUI, de propósito: cada linha é independente, então
// um valor mais longo quebra dentro da própria coluna sem desalinhar as outras
// duas. É a proposta que degrada melhor sob texto novo.
// ─────────────────────────────────────────────────────────────────────────

// A coluna do valor. Larga o bastante para "Frete grátis" (97,5px de glifos a
// 22px; 115,2px a 26px) e NÃO mais que isso — cada pixel a mais aqui vira vão
// morto entre o valor curto e o rótulo dele.
const PAUTA_COLUNA = 'clamp(104px, 9vw, 126px)'

function FichaTecnica({ className }: { className: string }) {
  return (
    <div className={className} style={{ borderTop: `1px solid ${dark.hairline}` }}>
      {hero.stats.map((s, i) => (
        // `flex-wrap` + `gap-y` não são enfeite: a 200% de zoom ou com Dynamic
        // Type o rótulo desce para a linha de baixo em vez de espremer o valor.
        <div
          key={s.label}
          className="flex flex-wrap items-baseline gap-x-[clamp(14px,2vw,20px)] gap-y-1 py-[clamp(12px,2.8vw,16px)]"
          style={{ borderTop: i === 0 ? undefined : `1px solid ${dark.hairline}` }}
        >
          <span
            className="text-[clamp(20px,5.6vw,22px)] sm:text-[clamp(22px,1.8vw,26px)]"
            style={{
              fontFamily: font.display,
              fontWeight: 600,
              letterSpacing: '-0.015em',
              lineHeight: 1.1,
              color: dark.text,
              flex: '0 0 auto',
              width: PAUTA_COLUNA,
            }}
          >
            {s.value}
          </span>
          <span className="min-w-0" style={{ ...typo.monoLabel, fontSize: 11, color: dark.muted }}>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  )
}
```

**Chamadas:**

```tsx
<FichaTecnica className="hidden sm:mt-auto sm:block" />
<FichaTecnica className="mt-[clamp(28px,5vw,40px)] sm:hidden" />
```

**Por que resolve o "horroroso"**

- **Alinhamento** é o argumento inteiro desta proposta: sai de uma aresta dura para duas. Medido em 390, os rótulos hoje começam em x=52 / x=118 / x=60; com a coluna fixa começam os três em x=118.
- **Ritmo.** O filete entre as linhas troca "distância de grupo" (os 20px de ar de hoje) por marcação explícita. Três linhas com régua leem como pauta — ficha técnica de catálogo, que é literalmente o que o bloco é.
- **Hierarquia.** Preserva a leitura em voz alta ("30x no boleto") que a rodada anterior conquistou: valor e rótulo continuam na mesma linha e na mesma linha de base.
- **Densidade.** É a mais folgada das três, e isso é uma escolha: cada condição ganha uma faixa horizontal inteira. Em 1440, onde a coluna de promessa tem 584px e sobra vão morto antes do pé, isso é uma vantagem real — a ficha ocupa a coluna em vez de se encolher no rodapé dela.

**O que custa**

| | 390 | 768 | 1440 |
|---|---|---|---|
| altura do bloco | 174,5px | 204,5px | 229,5px |
| `primeiroCampo` | 537 (inalterado) | **821 (+120)** | 399 (inalterado) |
| rolagem lateral | não | não | não |

- **O custo é o `primeiroCampo` em 768px.** Em 390 a ficha mora depois do formulário e a altura é grátis; em 1440 a grade `lg` isola as colunas e o `mt-auto` absorve. Mas entre 640 e 1023px a ficha vive **acima** do formulário na coluna de promessa, e ali B empurra o primeiro campo **120px para baixo**. Não é o número sagrado de 390, mas é o mesmo tipo de dano.
- **Risco em 390px:** zero de estouro. O valor tem 104px de coluna e "Frete grátis" 97,5px; o rótulo tem 237px e "CUSTO DA ASSESSORIA" 154,7px — nenhum quebra. Sobrevive a 320px.
- **Se o texto crescer:** degrada bem. Valor longo quebra em duas linhas dentro da própria coluna, sem contaminar as outras. Medido com texto inflado: 217,5px em 390 (vs 174,5), sem estouro. O que fica feio não é a quebra, é o vão: valor de 4 caracteres numa coluna de 104px vai continuar tendo 85px de nada até o rótulo.

---

### C — FILETE · *filete de abertura por tópico, valor e rótulo colados*

> "Tópicos" no vocabulário que a própria página já usa: um traço de 1px abrindo cada item — o mesmo dispositivo do eyebrow do hero — com a condição escrita como se fala em voz alta.

```tsx
// ─────────────────────────────────────────────────────────────────────────
// FICHA TÉCNICA — três tópicos, e o marcador é um FILETE.
//
// O pedido foi "design em tópicos, sem emoji, sem ícone". Um tópico precisa de
// marcador; a página já tem um, e ele não é ícone: o eyebrow deste mesmo hero
// abre com `<span width:22 height:1 background:gold>`. Um traço de 1px é
// vocabulário estabelecido aqui, e é a única forma de marcador que sobrevive à
// regra de "canto reto, filete de 1px, sem pictograma".
//
// ⚠️ O TRAÇO É `dark.hairlineStrong`, NÃO `dark.gold`, e isso é decisão
// registrada: o dourado é voltagem ÚNICA e escassa nesta linguagem (tokens.ts),
// e uma rodada anterior deste mesmo bloco tirou o dourado dos rótulos
// exatamente para não gastá-lo em condição comercial. Três traços dourados aqui
// desfariam aquela decisão de manhã.
//
// ⚠️ `translateY(-0.42em)` alinha o traço com a MEIA-ALTURA do valor e não com a
// linha de base. Sem isso o filete encosta no pé do número e lê como sublinhado
// deslocado. O valor é em `em` para acompanhar o `clamp()` do valor sozinho.
//
// ⚠️ MANTÉM O PAR BINDADO da rodada anterior — valor e rótulo na mesma linha,
// com 10px entre eles: lê-se "30x no boleto", que é como a frase é dita. O que
// esta proposta NÃO resolve é a segunda aresta: como os valores têm larguras
// diferentes, os rótulos continuam nascendo em três x distintos (150, 285 e 168
// em 390). Quem quiser a régua olha a proposta B.
//
// ⚠️ `flex-wrap` + `gap-y`: a 200% de zoom o rótulo desce em vez de espremer o
// valor. Sem isso "R$ 0 CUSTO DA ASSESSORIA" estoura.
// ─────────────────────────────────────────────────────────────────────────
function FichaTecnica({ className }: { className: string }) {
  return (
    <div className={className} style={{ borderTop: `1px solid ${dark.hairline}` }}>
      <div className="flex flex-col gap-y-[clamp(14px,3vw,20px)] pt-[18px] sm:pt-[clamp(22px,2.4vw,30px)]">
        {hero.stats.map((s) => (
          <div key={s.label} className="flex items-baseline gap-x-[clamp(12px,2.4vw,18px)]">
            <span
              aria-hidden
              style={{
                flex: '0 0 auto',
                width: 'clamp(20px, 3vw, 32px)',
                height: 1,
                background: dark.hairlineStrong,
                transform: 'translateY(-0.42em)',
              }}
            />
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-[10px] gap-y-1">
              <span
                className="text-[clamp(20px,5.6vw,22px)] sm:text-[clamp(22px,1.8vw,26px)]"
                style={{
                  fontFamily: font.display,
                  fontWeight: 600,
                  letterSpacing: '-0.015em',
                  lineHeight: 1.1,
                  color: dark.text,
                }}
              >
                {s.value}
              </span>
              <span style={{ ...typo.monoLabel, fontSize: 11, color: dark.muted }}>{s.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Chamadas:**

```tsx
<FichaTecnica className="hidden sm:mt-auto sm:block" />
<FichaTecnica className="mt-[clamp(28px,5vw,40px)] sm:hidden" />
```

**Por que resolve o "horroroso"**

- **Ritmo.** Entra um marcador onde não havia nenhum. Três traços iguais na margem criam pulso — o olho reconhece "lista" antes de ler qualquer palavra, que é a função que o dono pediu ("tópicos") e a única que o empilhamento anterior não cumpria.
- **Alinhamento.** Ganha uma margem esquerda nova (a dos traços) e mantém a dos valores. São duas, mas paralelas e a 32px uma da outra, o que é bem menos forte do que as duas arestas de B.
- **Hierarquia.** É a que mais protege a manchete: sem faixa, sem régua, sem caixa, o bloco continua sendo texto com um marcador. Ninguém confunde com um segundo título.
- **Densidade.** 144,5px em 390 — meio caminho entre a faixa (77,7) e a pauta (174,5).

**O que custa**

| | 390 | 768 | 1440 |
|---|---|---|---|
| altura do bloco | 144,5px | 168,5px | 193,5px |
| `primeiroCampo` | 537 (inalterado) | **785 (+84)** | 399 (inalterado) |
| rolagem lateral | não | não | não |

- **Risco em 390px:** o menor das três. Nada é `nowrap`, nada tem largura fixa, tudo quebra em vez de estourar. Medido com texto inflado: **altura idêntica** (144,5 → 144,5 em 390, 168,5 → 168,5 em 768) e zero estouro. É a proposta à prova de cliente.
- **O que custa mesmo:** +84px no `primeiroCampo` entre 640 e 1023px, e o serrilhado dos rótulos que ela não resolve. Também é a mais tímida: se o diagnóstico do dono for "esse bloco não tem presença", um traço de 20px não é resposta suficiente.

---

## 3. Comparação medida

| | atual (faixa 18px) | **A — Faixa** | **B — Pauta** | **C — Filete** |
|---|---|---|---|---|
| altura em 390 | 76,8 | **77,7** | 174,5 | 144,5 |
| altura em 768 | 84,5 | **83,9** | 204,5 | 168,5 |
| altura em 1440 | 112,0 | **88,2** | 229,5 | 193,5 |
| `primeiroCampo` 390 | 537 | 537 | 537 | 537 |
| `primeiroCampo` 768 | 701 | **700** | 821 (+120) | 785 (+84) |
| `primeiroCampo` 1440 | 399 | 399 | 399 | 399 |
| valor em 390 / 1440 | 18 / 26px | **21,8 / 25,9px** | 21,8 / 25,9px | 21,8 / 25,9px |
| rótulo | 10px | **11px** | 11px | 11px |
| arestas duras | 3 (2 filetes + base) | **4** | **4** | 2 |
| estouro com texto inflado | — | **11px ❌** | 0 ✅ | 0 ✅ |
| menor largura suportada | ~345px | ~345px | ≤320px | ≤320px |
| contraste do rótulo | 8,0–8,8:1 | 8,0–8,8:1 | 8,0–8,8:1 | 8,0–8,8:1 |

---

## 4. Veredito

**Defendo a A — e a defendo como calibragem, não como troca.**

O caminho da faixa já foi escolhido por quem mexeu no arquivo antes de mim, e o diagnóstico por trás dela está certo: três condições empilhadas são três objetos, e agrupá-las numa barra é o que transforma o bloco de lista em ficha. O que está errado é a execução, em dois pontos que a medição isola:

1. **O valor está 4px menor do que a coluna comporta**, e a justificativa disso no comentário do arquivo mede um `display:block` — devolve a largura da célula, não a do texto. "Frete grátis" mede 79,7px a 18px, não 97. Com `flex-1` no lugar de `grid-cols-3`, a coluna útil sai de 98,1 para 103,0px e 22px passa a caber com 5,5px de folga.
2. **O rótulo está em 10px sem precisar.** O contraste medido sobre o fundo composto (com a foto ligada) é 8,0:1 no pior caso — o dobro do que AA exige. Os 11px de `typo.monoLabel` cabem, e 11px é a diferença entre um rótulo que se lê e um rótulo que se adivinha num iPhone.

Fora isso, A é a única das três que **não cobra nada**: mesma altura em 390 (77,7 vs 76,8), menos altura em 1440 (88 vs 112), `primeiroCampo` inalterado em todas as larguras. B e C são propostas honestas, mas as duas pagam entre 84 e 120px de `primeiroCampo` na faixa de 640–1023px, e nenhuma das duas entrega o que a faixa entrega: *uma* parada de leitura em vez de três.

**Onde A é fraca, e não escondo:** ela é a única que transborda em silêncio se o texto crescer — 11px de estouro medido com "30x sem juros". O orçamento é de **~12 caracteres por valor**, e isso precisa virar comentário no código (está, na versão acima) porque `copy.ts` é editável pelo cliente e o dano não é visível em code review, só na tela. Se a probabilidade de o texto mudar for alta, **C é o plano B**: é a única com altura invariante sob texto inflado, e paga por isso 84px de `primeiroCampo` entre 640 e 1023px.

**B eu não defenderia.** Ela entrega a melhor régua das três — duas arestas duras, os rótulos todos no mesmo x — mas reintroduz, em escala menor, exatamente o vão morto que derrubou a rodada da manhã: 85px de nada entre "30x" e "NO BOLETO". Coluna fixa sempre cobra do item curto o espaço do item longo, e dois dos três itens aqui são curtos.

---

## 5. Como reproduzir as medidas

Tudo foi medido com Playwright contra `localhost:3000/femeas`, `deviceScaleFactor: 2`, depois de `document.fonts.ready` — sem isso a Oswald ainda não carregou e qualquer largura sai do fallback (foi o erro de uma rodada anterior).

- **Largura de texto:** `<span>` com `position:absolute; white-space:nowrap` e largura intrínseca. **Nunca** medir um `display:block` — ele devolve a largura do content-box do pai.
- **Coluna útil:** `getBoundingClientRect().width − paddingLeft − paddingRight` da célula.
- **Contraste:** screenshot recortado no bloco → `sharp().raw()` → percentil 90 da luminância dos pixels de fundo → razão contra `#B0B0B0`.
- **`primeiroCampo` / regressões:** `node scripts/femeas/medir-pagina.mjs` (baseline de hoje: 640 em mobile, 399 em desktop).
