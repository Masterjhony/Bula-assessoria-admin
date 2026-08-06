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
