# Assets da landing do perpétuo de fêmeas

Diretório servido em `/femeas/*`, com cache de 1 dia + `stale-while-revalidate`
de 7 dias.

## O que ESTÁ em uso (desde 06/08/2026)

| Arquivo | Onde | Origem |
|---|---|---|
| `hero-mobile.webp` (780×920) | banda do hero no celular | material do dono, 06/08 |
| `hero-desktop.webp` (1201×801) | full-bleed do hero no desktop | mesma foto, sem ampliar |
| `lote-close.webp` (1400×932) | faixa antes do fecho | material do dono, 06/08 |
| `curral-dourado.webp`, `curral-lote.webp` | **disponíveis, não usados** | material do dono, 06/08 |

⚠️ **Para trocar uma foto, troque o ARQUIVO — não o caminho no componente.** Os
recortes já estão calibrados para cada banda, e o scrim do hero foi medido em
cima deste material (ver abaixo).

## O scrim do hero foi MEDIDO, não estimado

O pelo do Nelore é quase branco: qualquer véu leve deixa texto claro sobre fundo
claro. Com o gradiente original, o eyebrow dourado media **2,50:1** sobre a foto
— reprova em AA, que pede 4,5:1 para texto pequeno.

Depois de fechar o scrim, medido no ponto **mais claro** do fundo atrás de cada
texto: eyebrow **4,99:1**, manchete **11,10:1**, olho **7,93:1**. Todos passam.

**Se a foto do hero for trocada por uma mais clara, refaça essa medição.**

### O método, para quem for repetir

Esconder o **texto** (`visibility: hidden` no elemento — o fundo atrás continua
igual), fotografar a página, recortar a caixa de cada texto e procurar o pixel
**mais claro** dentro dela. O contraste é calculado entre a cor declarada do
texto e esse pixel. É o pior caso: se passa nele, passa no resto da caixa.

### ⚠️ O DESKTOP NUNCA TINHA SIDO MEDIDO — e o olho reprova

Medição de **06/08/2026**, em 1440×900, com o mesmo método (os números do
celular batem com os de cima, o que valida o procedimento):

| Texto | Celular 390 | Desktop 1440 |
|---|---|---|
| eyebrow (`#C8A96E`) | 5,00:1 ✅ | 5,34:1 ✅ |
| manchete (`#F5F5F5`) | 11,25:1 ✅ | 9,17:1 ✅ |
| olho (`#B0B0B0`, 18px) | 7,95:1 ✅ | **4,11:1 ❌** |

O olho do hero no desktop pede 4,5:1 (18px regular **não** conta como texto
grande — a régua é 24px, ou 18,66px em negrito) e entrega 4,11:1.

**É defeito ANTERIOR, não regressão.** Foi medido nas duas pontas da rodada de
leveza de 06/08 e deu exatamente igual — nada do que se mexeu ali (ficha
técnica, filtro, ordem das seções) toca no scrim ou no olho.

Onde exatamente: **4,0% da caixa** do parágrafo, toda ela na **borda direita**
(o pior pixel fica a 96% da largura), que é onde o scrim horizontal do desktop
afina — `linear-gradient(90deg, …0.52 46%, 0.18 74%…)`.

**Não foi corrigido de propósito**, e o motivo é escolha, não esquecimento: todo
conserto cobra em cima de um hero que o dono acabou de aprovar —

1. fechar o scrim no meio (`0.52` → ~`0.62`) escurece a foto justo onde ela
   respira;
2. encurtar a medida do parágrafo (`max-w-[52ch]` → ~46ch) tira o texto da faixa
   clara, mas reflui a coluna inteira;
3. clarear o olho para `#F5F5F5` contraria a regra da linguagem — corpo é cinza
   editorial, nunca branco (ver `_lib/tokens.ts`).

Qualquer uma resolve. **É decisão de quem manda na página, não do próximo a
passar por aqui** — e agora está medida, então dá para decidir com número.

## O que foi RECUSADO, e por quê

Do material enviado em 06/08, duas fotos não entraram:

| Foto | Motivo |
|---|---|
| `10.01.06` | Jaqueta **"7P AGRO"** em primeiro plano, ocupando um terço do quadro |
| `10.01.26` | Mesma jaqueta, na pessoa à direita |

**Marca de terceiro numa landing de captação da Bula.** Não é regra inventada
aqui: a `galeria-femeas` do JMP já tinha sido recusada em parte pelo mesmo
motivo (uma delas com o logo da Chevrolet na camisa).

## A galeria `public/jmp/galeria-femeas/` NÃO serve

Conferida e **confirmada pelo dono em 06/08**: *"são machos mesmo, pode deixar
sem foto."* Não reabrir — o nome da pasta engana.

## A seção de CATEGORIAS continua sem foto de propósito

E não é por falta de material. **Foto de lote não distingue bezerra de novilha**,
e aquela seção existe para a pessoa escolher por onde entrar no plantel.
Ilustrar com um lote genérico seria informação falsa numa seção que orienta
decisão. As seis fotos de categoria — uma por estágio do animal — continuam
pendentes, e **ou vêm as seis, ou nenhuma**: com duas ou três, a grade fica com
um cartão ilustrado ao lado de cinco carentes.

## `og-femeas.jpg` continua faltando

**1200×630, JPG (não WEBP), recorte pronto.** O `layout.tsx` já aponta para ele,
então **todo link compartilhado hoje sai com o card quebrado** — e o WhatsApp,
que é onde o time repassa a landing, não renderiza WEBP no preview de forma
confiável.
