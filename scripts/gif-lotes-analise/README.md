# Card "Análise de Impacto Genético" (vídeo do lote dentro da peça)

Gera, por lote, **um único vídeo 1080×1844** com o card da Bula e o clipe de 6 s
tocando dentro da janela — um envio só no WhatsApp, em vez de imagem + GIF separados.
Estreou na leva São Geraldo/7P (01/08/2026), a pedido do chefe.

## Pipeline

1. **`deps.py`** — lê o catálogo PDF e extrai os DEPs completos dos três programas
   (IQG / MGTe / iABCZ) das páginas dos lotes escolhidos → `deps.json`.
   O mapa `LOTES = {lote: página}` vem do índice por RG (ver a memória do gif-lotes).
   Ordem posicional dos blocos: rótulos → `DEP` → n valores → `TOP%`/`DECA`/`P%` → n valores.
2. **`lotes.json`** — metadados por lote (peso, idade, CE, pai × mãe) + as **premissas**
   da simulação financeira.
3. **`card.mjs`** — HTML do card. Desenhado em `W = 1660 px` e reduzido por `SCALE`
   na renderização: mantém a tipografia grande em proporção e fecha a peça em ~9:16,
   que é o que o WhatsApp mostra bem (a 1080 px de largura direto, dava 1:2,5 — péssimo).
4. **`render.mjs`** — Playwright → `cards/cardNNN.png` + `cards/mask.png`
   (retângulo de cantos arredondados no tamanho exato da janela) + `cards/slot.json`
   com a posição da janela.
5. **Composição** (ffmpeg): o clipe entra na janela com os cantos arredondados via
   `alphamerge` com a máscara.

```sh
ffmpeg -y -loop 1 -i cards/cardNNN.png -ss <corte> -t 6 -i rawNNN.mp4 -i cards/mask.png \
  -filter_complex "[1:v]scale=$SW:$SH:force_original_aspect_ratio=increase,crop=$SW:$SH,setsar=1[v];\
[2:v]format=gray,scale=$SW:$SH[m];[v][m]alphamerge[va];\
[0:v][va]overlay=$SX:$SY:shortest=1,format=yuv420p[out]" \
  -map "[out]" -t 6 -r 30 -c:v libx264 -crf 26 -preset veryfast -movflags +faststart loteNNN.mp4
```

6. Envio pelo `scripts/gif-lotes-envia.mjs` de sempre — o job aponta `gifs_dir` para a
   pasta dos compostos e `media_width/height` para **1080×1844** (o iOS precisa do aspect).

## A conta do retorno

`DEP de peso à desmama (DP210) × R$/kg` = o que a genética paga **por bezerro**, contra
um touro de **DEP zero** (a média da raça). Depois multiplica por bezerros/safra e por
safras de vida útil. As premissas ficam em `lotes.json` e vão **impressas no rodapé da
peça** — sem isso o número não se defende.

O peso ao sobreano (DP450) aparece **em kg, não em R$**: o R$/kg de bezerro na desmama
não vale para um animal de 450 dias, e usar dois preços diferentes abriria flanco.

## Marca

Brandbook: Preto `#0A0A0A` · Grafite `#141414` · Branco · Dourado `#C9A84C` **cirúrgico**
(só tarja superior, número-herói e faixa de condições). Oswald caixa-alta nos títulos,
Inter nos números. A assinatura usa o arquivo `public/logo-bula-assessoria-white.png` —
a marca nunca é re-tipografada.
