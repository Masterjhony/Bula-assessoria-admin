# Auditoria independente do mapa de frete — 28/07/2026

Alvo: `src/app/saogeraldo/_lib/frete.ts` (27 UFs).
Referência: `Leilão Touros São Geraldo e 7P (CAT VIRTUAL).pdf`, página 3.
Auditor: terminal de dados e assets. Refeito do zero, sem reaproveitar a leitura anterior.

## Veredito

**1 divergência em 27: o AMAPÁ.** — *corrigida no `frete.ts` em 28/07, verificada abaixo.*

`frete.ts` declarava `AP: 'consulta'`. O PDF pinta o Amapá de **#999999 — "não é possível a entrega"**.
As outras 26 UFs conferem.

Distribuição correta: **17 grátis · 2 a partir de 2 lotes · 2 sob consulta · 6 sem entrega**.
O comentário do arquivo dizia "3 sob consulta · 5 sem entrega" e também foi corrigido.

Uma **segunda passada** (censo de 100% dos pixels + varredura de tinta órfã) foi
rodada depois da correção, para descartar que outra UF tivesse escapado pelo mesmo
mecanismo. Resultado: nenhuma outra divergência. Ver o final do documento.

## Método

Dois caminhos independentes, executados em sequência, com o segundo servindo de
prova do primeiro:

1. **Amostragem de pixel** — `pdftoppm -f 3 -l 3 -r 300 -png`, render de 2599×4134.
2. **Extração vetorial** — `pdftocairo -svg`. O mapa é vetor: cada UF é um
   `<path fill="rgb(...)">` próprio. Isso dá a tinta declarada pelo InDesign,
   sem antialiasing, sem eyedropper, sem tolerância.

Para cada um dos 29 polígonos do mapa (27 UFs + 2 fragmentos de ilha), o path do
SVG foi achatado em polígono, erodido 9px para nunca encostar em traço de
fronteira nem em rótulo branco, e o raster de 300 dpi foi amostrado dentro dessa
máscara. **Nos 29, a cor modal do raster bateu exatamente com o fill do vetor.**

A atribuição polígono→UF foi conferida visualmente com um overlay numerado sobre
o mapa: todos os 27 marcadores caem sobre a sigla impressa correspondente.

## As quatro tintas, valor exato do PDF

| faixa | valor exato no PDF | hex | declarado em `frete.ts` | Δ |
|---|---|---|---|---|
| grátis | (181.048, 156.060, 116.022) | `#B59C74` | `#B59C74` | exato |
| a partir de 2 lotes | (127.500, 104.294, 82.617) | `#806853` | `#816852` | +1 R, −1 B |
| sob consulta | (141.780, 159.118, 147.387) | `#8E9F93` | `#8EA094` | +1 G, +1 B |
| sem entrega | (153.254, 153.254, 152.745) | `#999999` | `#999999` | exato |

Os desvios de ±1/255 são ruído de arredondamento, imperceptíveis (ΔE < 1).
Não são erro de dado, mas as duas constantes podem ser corrigidas de graça.

## As 27 medições

Ponto amostrado = centroide do polígono, em coordenadas do render de 300 dpi.
Pureza = fração da máscara erodida que é exatamente a tinta (o resto é rótulo
branco e antialiasing de fronteira).

| UF | ponto | raster | vetor | pureza | PDF diz | `frete.ts` diz | |
|---|---|---|---|---|---|---|---|
| RO | (897, 2261) | `#B59C74` | `#B59C74` | 92.6% | gratis | gratis | CONFERE |
| AC | (548, 2212) | `#999999` | `#999999` | 89.6% | semEntrega | semEntrega | CONFERE |
| AM | (845, 1908) | `#999999` | `#999999` | 98.9% | semEntrega | semEntrega | CONFERE |
| RR | (993, 1617) | `#999999` | `#999999` | 92.4% | semEntrega | semEntrega | CONFERE |
| PA | (1420, 1881) | `#8E9F93` | `#8E9F93` | 98.8% | consulta | consulta | CONFERE |
| **AP** | **(1445, 1660)** | **`#999999`** | **`#999999`** | **88.9%** | **semEntrega** | **consulta** | **DIVERGE** |
| TO | (1657, 2234) | `#8E9F93` | `#8E9F93` | 95.0% | consulta | consulta | CONFERE |
| MA | (1776, 2003) | `#B59C74` | `#B59C74` | 93.5% | gratis | gratis | CONFERE |
| PI | (1912, 2113) | `#B59C74` | `#B59C74` | 95.5% | gratis | gratis | CONFERE |
| CE | (2058, 2012) | `#B59C74` | `#B59C74` | 89.7% | gratis | gratis | CONFERE |
| RN | (2206, 2046) | `#B59C74` | `#B59C74` | 79.0% | gratis | gratis | CONFERE |
| PB | (2199, 2099) | `#B59C74` | `#B59C74` | 83.1% | gratis | gratis | CONFERE |
| PE | (2142, 2155) | `#B59C74` | `#B59C74` | 91.2% | gratis | gratis | CONFERE |
| AL | (2209, 2213) | `#B59C74` | `#B59C74` | 87.1% | gratis | gratis | CONFERE |
| SE | (2172, 2259) | `#B59C74` | `#B59C74` | 78.4% | gratis | gratis | CONFERE |
| BA | (1948, 2381) | `#B59C74` | `#B59C74` | 97.0% | gratis | gratis | CONFERE |
| MG | (1791, 2647) | `#B59C74` | `#B59C74` | 96.6% | gratis | gratis | CONFERE |
| ES | (2003, 2713) | `#806853` | `#806853` | 82.7% | gratis2lotes | gratis2lotes | CONFERE |
| RJ | (1913, 2833) | `#806853` | `#806853` | 79.1% | gratis2lotes | gratis2lotes | CONFERE |
| SP | (1651, 2842) | `#B59C74` | `#B59C74` | 94.3% | gratis | gratis | CONFERE |
| PR | (1491, 2971) | `#B59C74` | `#B59C74` | 92.0% | gratis | gratis | CONFERE |
| SC | (1531, 3090) | `#999999` | `#999999` | 86.7% | semEntrega | semEntrega | CONFERE |
| RS | (1405, 3236) | `#999999` | `#999999` | 95.2% | semEntrega | semEntrega | CONFERE |
| MS | (1312, 2744) | `#B59C74` | `#B59C74` | 94.9% | gratis | gratis | CONFERE |
| MT | (1230, 2400) | `#B59C74` | `#B59C74` | 98.2% | gratis | gratis | CONFERE |
| GO | (1614, 2509) | `#B59C74` | `#B59C74` | 93.7% | gratis | gratis | CONFERE |
| DF | (1663, 2519) | `#B59C74` | `#B59C74` | 100.0% | gratis | gratis | CONFERE |

## Ponto 1 — o DF: CONFIRMADO

O DF não tem rótulo, mas **tem path próprio**. O SVG traz um
`<path fill="rgb(70.999146%, 61.199951%, 45.498657%)">` isolado, bbox
x[1641–1682] y[2509–2533] no render de 300 dpi — o quadrilátero clássico do DF,
a leste do centro de GO, dentro do bbox de GO (x[1403–1754] y[2361–2700]).

Isso é mais forte do que a amostragem original sugeria: o DF não *herda* a tinta
de Goiás por omissão, ele recebe a tinta `#B59C74` **explicitamente atribuída**
no arquivo do InDesign. As três coordenadas citadas no comentário do `frete.ts`
— (1663,2522), (1668,2527), (1658,2518) — caem todas dentro desse bbox.

Amostrando a máscara erodida do polígono: 369 px, 100% `#B59C74`.

**DF = frete grátis. Confirmado por vetor e por raster.**

## Ponto 2 — SC e RS: CONFIRMADOS

Contraintuitivo, mas é o que está impresso.

- SC — path `#999999`, bbox x[1374–1622] y[3023–3181], 14 847 px amostrados, 86.7% puros.
- RS — path `#999999`, bbox x[1188–1564] y[3080–3400], 51 596 px amostrados, 95.2% puros.
  (mais um fragmento litorâneo de 579 px, também `#999999`, 100% puro)

Não há polígono verde nem bege no Sul abaixo do Paraná. O PR é o último estado
com frete grátis descendo o mapa. **Nada a corrigir aqui.**

## Como o erro do AP provavelmente nasceu

`#999999` e `#8E9F93` diferem no máximo em **11/255** por canal
(R 153→142, G 153→159, B 153→147). Qualquer amostragem com tolerância ≥ 11
funde as duas faixas, e a que for testada primeiro vence.

Isto não é teoria: na minha primeira passada eu usei tolerância 14 e o meu
próprio script classificou o polígono do AP como `consulta`. Só a extração
vetorial derrubou o resultado. O AP é o caso mais exposto do mapa porque é
pequeno, fica encostado no PA (que é verde de verdade) e é o único estado cinza
cercado de verde.

## O que corrigir em `frete.ts` (não editei — reporte apenas)

1. `{ codigo: '16', sigla: 'AP', ... faixa: 'consulta' }` → `faixa: 'semEntrega'`
2. Comentário da distribuição: "3 sob consulta · 5 sem entrega" → **"2 sob consulta · 6 sem entrega"**
3. Opcional, cosmético: `#816852` → `#806853` e `#8EA094` → `#8E9F93`

O item 3 desloca minimamente os contrastes tabelados no comentário do arquivo;
vale remedir se as constantes forem trocadas.

---

# Segunda passada — 28/07, depois da correção do AP

A amostragem por centroide prova o centro do polígono, não o polígono inteiro.
Um estado pintado em duas tintas, ou um polígono meu mal atribuído, passaria.
Esta passada fecha os dois buracos.

## Censo de 100% dos pixels, por UF

Máscara do polígono erodida só 3px (o suficiente para não encostar no traço de
fronteira), e **todo** pixel de dentro classificado. Tolerância 4 — o menor gap
entre duas tintas quaisquer é 11 (`#999999` vs `#8E9F93`), então nenhum pixel
pode casar com duas tintas ao mesmo tempo.

A coluna que importa é a última: **quantos pixels de uma tinta que não é a do
estado aparecem dentro dele**.

| UF | vetor | px | tinta do estado | rótulo | traço | transição | **outras tintas** |
|---|---|---|---|---|---|---|---|
| AM | `#999999` | 290 343 | 287 207 | 2 904 | 0 | 232 | **0** |
| PA | `#8E9F93` | 214 632 | 212 107 | 2 242 | 0 | 283 | **0** |
| MT | `#B59C74` | 168 888 | 165 980 | 2 623 | 0 | 285 | **0** |
| MG | `#B59C74` | 108 607 | 105 021 | 3 146 | 0 | 440 | **0** |
| BA | `#B59C74` | 100 054 | 97 161 | 2 574 | 0 | 319 | **0** |
| MS | `#B59C74` | 68 168 | 64 898 | 2 880 | 0 | 390 | **0** |
| GO | `#B59C74` | 61 982 | 58 233 | 2 478 | 848 | 423 | **0** |
| MA | `#B59C74` | 54 818 | 51 424 | 3 018 | 0 | 376 | **0** |
| RS | `#999999` | 53 098 | 50 656 | 2 242 | 0 | 200 | **0** |
| TO | `#8E9F93` | 47 350 | 45 110 | 2 060 | 0 | 180 | **0** |
| SP | `#B59C74` | 44 546 | 42 131 | 2 084 | 0 | 331 | **0** |
| PI | `#B59C74` | 43 118 | 41 251 | 1 562 | 0 | 305 | **0** |
| RO | `#B59C74` | 41 101 | 38 195 | 2 532 | 0 | 374 | **0** |
| RR | `#999999` | 40 577 | 37 635 | 2 720 | 0 | 222 | **0** |
| PR | `#B59C74` | 36 939 | 34 049 | 2 459 | 0 | 431 | **0** |
| AC | `#999999` | 24 291 | 21 906 | 2 191 | 0 | 194 | **0** |
| CE | `#B59C74` | 23 496 | 21 199 | 1 978 | 0 | 319 | **0** |
| AP | `#999999` | 22 174 | 19 858 | 2 145 | 0 | 171 | **0** |
| SC | `#999999` | 15 722 | 13 723 | 1 779 | 5 | 215 | **0** |
| PE | `#B59C74` | 12 897 | 11 842 | 872 | 0 | 183 | **0** |
| RN | `#B59C74` | 7 134 | 5 760 | 1 142 | 0 | 232 | **0** |
| ES | `#806853` | 6 899 | 5 738 | 954 | 0 | 207 | **0** |
| PB | `#B59C74` | 6 718 | 5 657 | 906 | 0 | 155 | **0** |
| RJ | `#806853` | 5 412 | 4 319 | 899 | 0 | 194 | **0** |
| AL | `#B59C74` | 3 353 | 2 972 | 311 | 0 | 70 | **0** |
| SE | `#B59C74` | 2 399 | 1 951 | 359 | 0 | 89 | **0** |
| DF | `#B59C74` | 470 | 470 | 0 | 0 | 0 | **0** |
| *(ilha do AP)* | `#999999` | 3 984 | 3 984 | 0 | 0 | 0 | **0** |
| *(lagoa do RS)* | `#999999` | 828 | 824 | 0 | 0 | 4 | **0** |

**Nenhuma UF contém um único pixel de outra tinta de mapa.** Todo o resto é
rótulo branco, traço de fronteira e antialiasing (<1% em toda UF). Os 848 px de
traço dentro de GO são o contorno do DF, desenhado por cima.

## Varredura de tinta órfã

O censo prova que os polígonos que eu achei estão certos. Não prova que eu achei
todos. Teste: monto a silhueta do mapa (união dos 29 polígonos, fechada e
preenchida) e procuro qualquer pixel de tinta dentro dela que não pertença a
nenhum polígono. Um estado que eu tivesse deixado passar apareceria aqui como
uma mancha.

```
área da silhueta do mapa                          1 696 170 px
cobertura pelos 29 polígonos                          95,69 %
componentes de tinta órfã dentro da silhueta               1
maior componente órfão                           2 px, x[1422-1423] y[3042]
```

Dois pixels, na fronteira PR/SP — antialiasing. Os 4,31% não cobertos são traço
de fronteira e glifo de rótulo, que não são tinta. **Não há polígono faltando.**

(Os órfãos grandes da página ficam todos fora da silhueta: as barras da legenda,
as letras de "FRETE GRÁTIS*" em `#B59C74`, o filete vertical do card e o filete
horizontal sob o cabeçalho.)

## Os cinco pedidos: RO, MA, PI, ES, RJ

Conferidos com o contorno do polígono desenhado por cima do mapa
(`nortes.png`, `esrj.png`):

- **RO** — contorno fecha sobre o estado rotulado RO, bege, encostado no AM
  cinza. Fronteira limpa. 38 195 px `#B59C74`, 0 px cinza. **CONFERE**
- **MA** — contorno fecha sobre MA, bege, encostado no PA e no TO verdes.
  51 424 px `#B59C74`, 0 px verde. **CONFERE**
- **PI** — contorno fecha sobre PI, bege, entre MA e CE. 41 251 px `#B59C74`,
  0 px de qualquer outra tinta. **CONFERE**
- **ES** — faixa estreita, mas inteira em `#806853`. 5 738 px, **0 px `#B59C74`**.
  A faixa não se confunde com o bege: o gap entre `#806853` e `#B59C74` é de
  54/52/34 por canal, cinco vezes o gap que derrubou o AP. **CONFERE**
- **RJ** — idem, 4 319 px `#806853`, **0 px `#B59C74`**. **CONFERE**

## Conclusão da segunda passada

26 CONFERE, 0 DIVERGE. Somado à correção do AP, o `frete.ts` agora reproduz o
mapa da página 3 exatamente, UF por UF, pixel por pixel.

---

## Reprodutibilidade

```
pdftoppm -f 3 -l 3 -r 300 -png "<pdf>" p3
pdftocairo -svg -f 3 -l 3 "<pdf>" p3.svg
```

Scripts da auditoria, em `scripts/`:
`audita-frete-01-paths-svg.py` (bbox + fill de todo path preenchido),
`audita-frete-02-amostra.py` (achatamento, erosão e amostragem dos 29 polígonos),
`audita-frete-03-tabela.py` (tabela comparativa contra `frete.ts`),
`audita-frete-04-censo.py` (censo de 100% dos pixels + varredura de tinta órfã).
