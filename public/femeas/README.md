# Assets da landing do perpétuo de fêmeas

Diretório servido em `/femeas/*`, com cache de 1 dia + `stale-while-revalidate`
de 7 dias (regra própria em `next.config.mjs`, não compartilhada com `/touros`).

## O que falta chegar

Nada aqui ainda. A página renderiza sem estes arquivos — os stubs da Fase 3 não
referenciam imagem —, mas o card de compartilhamento sai quebrado sem o OG.

| Arquivo | Formato | Uso | Bloqueia |
|---|---|---|---|
| `og-femeas.jpg` | **JPG** 1200×630 | preview de link (WhatsApp, Meta, Google) | compartilhamento |
| `hero-mobile.webp` | WEBP, retrato | fundo do hero no mobile | Fase 7 |
| `hero-desktop.webp` | WEBP, paisagem | fundo do hero no desktop | Fase 7 |
| fotos de categoria | WEBP | seção de categorias — embriões, bezerras, novilhas, prenhes, 3 em 1, doadoras | Fase 7 |

## O OG tem que ser JPG, não WEBP

O WhatsApp não renderiza WEBP de forma confiável no preview de link, e o
WhatsApp é o canal onde o time repassa a landing. Vale para o OG apenas — o
resto dos assets é WEBP normalmente, que é mais leve. Mesma decisão registrada
em `src/app/saogeraldo/README.md`.

## Enquadramento

O `/touros` aprendeu isso na prática: a primeira foto de OG era retrato e vinha
cortada no card. Mandar o recorte 1200×630 já pronto, não deixar o corte para o
Meta decidir.

O assunto das fotos aqui é **matriz e recria**, não touro — a promessa da página
é o criatório próprio. Foto de touro nesta landing contradiz a segmentação que a
página inteira existe para fazer.
