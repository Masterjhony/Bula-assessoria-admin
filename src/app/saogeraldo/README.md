# Landing do Leilão Touros São Geraldo e 7P

Servida em **saogeraldo.bulaassessoria.com**. Único KPI: cadastro qualificado
antes do leilão.

A página reproduz as **três primeiras páginas do catálogo** em PDF, com o
formulário de captura inserido entre a capa e as condições:

```
Nav ─ Hero (capa, pág. 1) ─ Captura ─ Pagamento (pág. 2) ─ Frete (pág. 3) ─ Rodapé
```

---

## Onde mexer em cada coisa

| O que trocar | Onde | Observação |
| --- | --- | --- |
| **Data-alvo da contagem** | `_lib/evento.ts` → `EVENTO.dataHoraISO` | Uma linha. Fuso `-03:00` explícito. Trocar o ano é trocar só isso. |
| **Data por extenso, dia da semana, hora** | `_lib/evento.ts` → `EVENTO` | A contagem e a nav leem daqui. |
| **Condições de pagamento** | `_lib/evento.ts` → `PAGAMENTO_CATALOGO` | Uma entrada por item: `linha` + `detalhe`. A caixa alta é do preset, não do dado. |
| **Textos do hero, títulos, eyebrows** | `_lib/copy-catalogo.ts` | Nenhum componente escreve texto. |
| **Faixa de frete de um estado** | `_lib/frete.ts` → `UFS` | Trocar o campo `faixa`. O mapa e a tabela seguem sozinhos. |
| **Cores das faixas de frete** | `_lib/frete.ts` → `FAIXAS` | Ver a nota de contraste antes de mexer. |
| **Paleta, tipografia, espaçamento** | `_lib/tokens.ts` | Cor solta em componente é dívida. |
| **Fontes carregadas** | `layout.tsx` | Cada peso novo custa ~22 KB. |
| **Imagem de compartilhamento** | `layout.tsx` → `openGraph.images` | JPG, não WEBP — WhatsApp. |

Não há lista de patrocinadores: o cliente decidiu em 28/07 que esta é uma
página **exclusiva de São Geraldo**, e os blocos de realização, leiloeiras,
transmissão e patrocínio saíram.

---

## O mapa do Brasil

A malha é a oficial do **IBGE** (domínio público), baixada uma vez e commitada
como módulo estático em `_components/mapa-brasil-paths.ts`. A página nunca faz
fetch para desenhar a seção.

Para regerar (por exemplo, se o IBGE atualizar as divisas):

```
node scripts/gera-mapa-brasil.mjs
```

O script casa cada `<path id="NN">` pelo **código IBGE**, não pela sigla, e
calcula a âncora do rótulo pelo centróide de área do maior polígono de cada
UF. Os estados pequenos do Nordeste, o ES e o RJ têm deslocamento manual na
constante `AJUSTE_ROTULO`, dentro do próprio script. O **DF não recebe sigla** —
o catálogo também não o rotula, e a sigla colidiria com "GO".

---

## Regras que não se quebram

**A navegação pós-submit é `window.location.assign`, nunca `router.push`.**
Só um load completo dispara o gatilho Page View do GTM, que é onde a tag de
conversão do Meta roda. Uma navegação SPA mata a conversão **sem erro
visível**. Está em `_components/Formulario.tsx`, com os commits de referência
no comentário.

**Nada é empurrado ao `dataLayer`.** O container tem um acionador catch-all;
qualquer push duplicaria PageView e dispararia Meta/GA4 a cada micro-evento.
Ver `_lib/analytics.ts`.

**O formulário aparece uma vez só**, em `#cadastro`. Duas instâncias
duplicariam os cinco eventos de funil. Todos os CTAs ancoram lá.

**O veredito de MQL é sempre do servidor**, nunca do browser
(`api/saogeraldo/lead/route.ts`).

**As listas de opções do formulário existem em dois lugares** — no client
(`Formulario.tsx`) e no servidor (`route.ts`) — e precisam concordar. Uma
terceira cópia é como o lead começa a ser recusado sem ninguém entender por quê.

---

## Contraste: os números que sustentam a paleta

Medidos em WCAG 2.1, não estimados. Se você trocar uma cor, remeça.

```
 18,34  off-white  #FFFFFC  sobre carvão profundo #1A130D
 16,34  creme      #F7F1E6  sobre carvão profundo
  7,53  champagne  #B9A46F  sobre carvão profundo
  6,58  champagne           sobre carvão          #2B1F13
  5,58  champ-dark #988D70  sobre carvão profundo
  4,47  faint      #8A7B66  sobre carvão profundo   → texto GRANDE só
```

Três proibições que vieram de medição:

- **`--champagne` sobre fundo claro mede 2,44:1 e reprova em qualquer
  tamanho.** Foi por isso que a seção de captura é carvão profundo e não
  off-white, como o desenho de referência propunha. Rótulo pequeno dourado
  sobre claro usa `light.goldText` (#6E5A2E, 6,62:1).
- **`--moss` sobre carvão mede 1,94:1.** Só como fio ou wash, nunca texto.
- **`muted` dentro de card elevado cai para 4,05:1.** Use `body` lá.

No mapa, a sigla **não é branca**, ao contrário do impresso: branco reprova em
três das quatro faixas (2,63 / 2,76 / 2,85). A sigla é `#201812` nas faixas
clara, verde e cinza (6,64 / 6,33 / 6,14) e branca só na `#816852` (5,20).
É a única divergência deliberada em relação ao PDF, e existe porque a sigla
carrega informação.

---

## Decisões de acessibilidade que parecem bug e não são

**A contagem regressiva é `aria-hidden`, não `aria-live`.** Um contador que
muda a cada segundo seria lido em laço por leitor de tela, sequestrando a
navegação. A informação que importa anunciar — dia, mês, dia da semana e
hora — está logo acima, em texto estático. O desenho de referência pedia
`aria-live`; seguir o pedido pioraria a página para quem mais depende dela.

**O mapa tem uma tabela em texto equivalente**, dentro de um `<details>`
fechado. Não é enfeite: informação essencial não pode existir só como forma
geométrica, e num telefone de 375px o mapa é pequeno demais para leitura
confiável.

**Com `prefers-reduced-motion`, a contagem perde o bloco de segundos** (passa
a atualizar de minuto em minuto) e a dica de rolagem some. Sem a animação ela
seria só uma seta parada, que não informa nada.

---

## Procedência dos assets

Tudo em `public/saogeraldo/` saiu do PDF do catálogo, extraído com `pdfimages`
e `pdftoppm` e tratado com `sharp`:

| Arquivo | O que é |
| --- | --- |
| `hero-fundadores.webp` | A capa **sem o texto por cima** — o PDF guarda o fundo como bitmap único. 1044×1658 é a resolução nativa; não há maior no arquivo. |
| `letreiro-sao-geraldo-7p.webp` | O letreiro metálico, com máscara de transparência. É o `<h1>` da página; o texto vive no `alt`. Ouro escovado com bisel não se recria em CSS. |
| `selos-certificacao.webp` | PMGZ, ANCP, Embrapa e GenePlus. Fundo recortado por distância de cor (não por luminância, que comeria o azul da ANCP). |
| `og-saogeraldo.jpg` | Recorte 1200×630 da capa para o preview de link. |

Se o cliente enviar o material original da agência, a foto do hero é a que
mais ganha — 1044px de largura é confortável no celular e apertado num
desktop de 1440px.
