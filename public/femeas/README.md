# Assets da landing do perpétuo de fêmeas

Diretório servido em `/femeas/*`, com cache de 1 dia + `stale-while-revalidate`
de 7 dias (regra própria em `next.config.mjs`, não compartilhada com `/touros`).

## O que falta chegar

Nada aqui ainda. A página renderiza sem estes arquivos — os stubs da Fase 3 não
referenciam imagem —, mas o card de compartilhamento sai quebrado sem o OG.

| Arquivo | Formato | Uso | Bloqueia |
|---|---|---|---|
| `og-femeas.jpg` | **JPG** 1200×630 | preview de link (WhatsApp, Meta, Google) | compartilhamento |
| `hero-mobile.webp` | WEBP, retrato | banda fotográfica do hero no mobile | melhora a Fase 7 |
| `hero-desktop.webp` | WEBP, paisagem | fundo full-bleed do hero no desktop | melhora a Fase 7 |
| `categoria-<id>.webp` | WEBP, 4:3 | cartões da seção de categorias — **seis arquivos** | melhora a Fase 7 |

## A Fase 7 NÃO está bloqueada por foto — os encaixes já existem e estão vazios

A página foi construída para ser boa **sem** imagem (tratamento tipográfico,
troca de superfície entre blocos, filetes). Os encaixes existem no código e são
**invisíveis enquanto vazios** — não há retângulo cinza nem espaço reservado em
lugar nenhum. Quando o material de 14–15/08 chegar, é assim que ele entra:

| O quê | Onde ligar | Como |
|---|---|---|
| Hero | `src/app/femeas/_components/Hero.tsx` | trocar `FOTO_MOBILE` e `FOTO_DESKTOP` de `null` para o caminho do arquivo. O scrim e o gradiente já estão escritos |
| Categorias | `src/app/femeas/_components/Categorias.tsx` | preencher o mapa `FOTOS` (chave = `id` da categoria em `_lib/categorias.ts`, valor = caminho) |

O `<id>` do arquivo de categoria é **exatamente** o campo `id` de
`src/app/femeas/_lib/categorias.ts` — é ele que também vai para a planilha, então
o nome do arquivo e o dado do CRM não divergem.

⚠️ **Categoria é tudo ou nada.** Com duas ou três fotos, a grade fica com um
cartão ilustrado ao lado de cinco carentes — pior que a versão tipográfica
inteira, que é homogênea. Ou chegam as seis, ou o mapa continua vazio.

⚠️ **O texto alternativo do hero mora em `_lib/copy.ts`** (`hero.fotoAlt`), não
no componente: quem troca a foto troca a descrição junto.

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
