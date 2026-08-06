# Material de imagem — o que a landing de fêmeas precisa

**Para a gravação na fazenda em 14–15/08.** Este documento é para a conversa com
o Marcelo; o passo a passo técnico de como ligar cada arquivo está em
`public/femeas/README.md`.

**Estado hoje: a página está no ar sem nenhuma foto, e não está quebrada** — o
tratamento é tipográfico de propósito (ver `EXECUCAO.md`, Desvio 6). Os encaixes
existem e são invisíveis enquanto vazios. Nada aqui é emergência de layout; é
ganho de conversão, com uma exceção — o item 1, que já causa dano hoje.

**A regra que vale para tudo:** o assunto é **matriz e recria**. Foto de touro
nesta landing contradiz a segmentação que a página inteira existe para fazer. Se
a única foto disponível for de touro, é melhor ficar sem foto.

---

## 1. `og-femeas.jpg` — o único que já causa dano hoje 🔴

**1200×630, JPG (não WEBP), recorte já pronto.**

O `layout.tsx` já aponta para este arquivo. Como ele não existe, **todo link da
landing compartilhado hoje sai com o card quebrado** — e o WhatsApp é o canal
onde o time repassa a página.

- **JPG, não WEBP:** o WhatsApp não renderiza WEBP de forma confiável no preview.
- **Recorte 1200×630 pronto**, não retrato. O `/touros` aprendeu isso na prática:
  a primeira foto de OG era retrato e veio cortada no card. Não deixar o corte
  para o Meta decidir.

---

## 2. As seis fotos de categoria — o buraco mais caro 🟠

`categoria-<id>.webp`, proporção **4:3**. Os `id` são os de
`src/app/femeas/_lib/categorias.ts`:

`embrioes` · `bezerras` · `novilhas` · `prenhes` · `pacote-3-em-1` · `doadoras`

**Por que custa caro:** a diferença entre uma bezerra, uma novilha e uma prenhe é
**visual e de estágio do animal**. Hoje ela é só descrita em texto. Quem está
decidindo por onde entrar no plantel precisa **ver** a diferença — é literalmente
a pergunta que a seção existe para responder.

⚠️ **Ou vêm as seis, ou nenhuma.** Com duas ou três, a grade fica com um cartão
ilustrado ao lado de cinco carentes — pior que a versão homogênea de hoje.

⚠️ `embrioes` é a difícil: não há animal para fotografar. Vale combinar
antecipadamente o que entra aí (botijão, laboratório, implantação) em vez de
descobrir na hora que faltou.

---

## 3. `hero-mobile.webp` — maior impacto por menor esforço 🟡

**Retrato**, para uma banda de ~44svh no topo do celular.

A primeira dobra no celular é **100% texto** hoje: logo, kicker, manchete, olho de
cinco linhas, aviso de análise, ficha técnica — e só então o formulário. É um
público que decide por animal chegando ao campo de cadastro sem ter visto um.

Ligar é trocar uma constante de `null` pelo caminho do arquivo; o scrim já está
escrito.

---

## 4. `hero-desktop.webp` — fecha um vão real 🟡

**Paisagem**, full-bleed.

No desktop o card do formulário é bem mais alto que a coluna de copy. O vão que
sobra hoje é preenchido por uma inicial de livery a 4,5% — funciona, mas é
recurso ocupando lugar de imagem.

---

## E o que NÃO é foto

**Prova social (pendência C-07).** A faixa de logos de criatório está no ar com
frase **qualitativa e sem número**, de propósito: o `+1.000 touros PO apartados`
do `/touros` é prova de **touro** e aqui não serve — o comprador de matriz quer
ver **criatório formado**, não touro apartado.

Se o cliente quiser número nesta página, ele precisa **fornecer** o número
(criatórios atendidos, matrizes vendidas, plantéis formados). **Não estimar.** É
o tipo de claim que, sendo desmentido na reunião com o assessor, queima
exatamente o momento que é o KPI do funil.
