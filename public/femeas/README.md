# Assets da landing do perpétuo de fêmeas

Diretório servido em `/femeas/*`, com cache de 1 dia + `stale-while-revalidate`
de 7 dias (regra própria em `next.config.mjs`, não compartilhada com `/touros`).

## O que falta chegar

Continua **vazio**. A página renderiza sem estes arquivos, mas o card de
compartilhamento sai quebrado sem o OG.

| Arquivo | Formato | Uso | Bloqueia |
|---|---|---|---|
| `og-femeas.jpg` | **JPG** 1200×630 | preview de link (WhatsApp, Meta, Google) | compartilhamento |
| `hero-mobile.webp` | WEBP, retrato | banda fotográfica do hero no mobile | melhora a Fase 7 |
| `hero-desktop.webp` | WEBP, paisagem | fundo full-bleed do hero no desktop | melhora a Fase 7 |
| `categoria-<id>.webp` | WEBP, 4:3 | cartões da seção de categorias — **seis arquivos** | melhora a Fase 7 |

Tudo isso depende da gravação de **14–15/08** (`.planning/femeas-perpetuo/
MATERIAL-NECESSARIO.md`). Hoje a primeira dobra no celular é 100% texto, e é
uma perda conhecida — não um esquecimento.

## ⚠️ `public/jmp/galeria-femeas/` NÃO serve. Conferida e **confirmada pelo dono** (06/08/2026)

O nome engana e a pasta já foi puxada uma vez como solução para o hero. **Não
é.** As quatro fotos foram abertas e ampliadas uma a uma; nenhuma passou.

> **A dúvida do sexo foi levada ao dono do projeto com os recortes ampliados, e
> ele respondeu: "são machos mesmo, pode deixar sem foto."** Isto não é mais
> leitura de quem programou — é decisão de quem conhece o lote. **Não reabrir.**
> Se alguém achar que "dá para usar uma só", a resposta já foi dada.

| Arquivo | Por que foi descartada |
|---|---|
| `IMG_0106.jpg` | Os animais em primeiro plano **não são matrizes**. Cupim alto com capa escura sobre cernelha e quartos, cernelha grossa, e — decisivo — **linha inferior reta, sem úbere**, num ângulo de três-quartos traseiro em que o úbere de uma vaca adulta seria inevitável. É boiada em terminação (há cocho e brete no quadro) |
| `IMG_0109.jpg` | Mesmo lote, mesmo curral, mesmos cupins. Mesmo problema |
| `IMG_0062.jpg` | Mesmo problema de sexo, **mais duas marcas de terceiro**: jaqueta "7P AGRO" nas costas do rapaz na cerca e logo Chevrolet na camisa em primeiro plano. Também é escura e enlameada |
| `IMG_0117.jpg` | Logo **"7P AGRO"** ocupando o centro do quadro. A pessoa É o assunto — recortar a marca é recortar a foto inteira |

Duas regras saíram daí, e valem para a próxima tentativa:

1. **Foto de macho contradiz a segmentação que esta página inteira existe para
   fazer.** O assunto tem que ser **matriz e recria**. Na dúvida sobre o sexo de
   um animal, a foto não entra.
2. **Nada de marca de outra empresa numa landing de captação da Bula.** Vale
   para jaqueta, boné, camisa, placa e brinco.

`public/jmp/capa-playlist-femeas.jpg` também não serve: é arte de flyer de
leilão, coberta de logos de terceiros (Canal Rural, ANCP, PMGZ, Leiloboi…).

## As fotos de categoria são tudo ou nada — e são fotos de LOTE, não de matriz

Mesmo quando chegar material da fazenda, foto de **manejo/lote** não resolve a
seção de categorias: ela existe para a pessoa se encaixar em uma das seis, e
lote no curral não distingue bezerra de novilha. Usar uma foto genérica em seis
cartões diferentes seria informação falsa exatamente onde a página pede decisão.
São necessários seis recortes que mostrem o **estágio** do animal.

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
