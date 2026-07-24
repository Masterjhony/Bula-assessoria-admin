# Assets da landing de touros (`/touros`)

Coloque aqui as fotos **definitivas** do cliente. Enquanto não chegam, a página
usa candidatas reais já existentes no projeto (`/jmp/galeria-touros/*`,
`/criatorios/*`).

Arquivos esperados (nomes sugeridos):

- `hero.jpg` — foto de fundo do hero (touro em destaque, boa resolução, ~1920px de largura).
- `og.jpg` — imagem Open Graph (1200×630) para compartilhamento em ads/redes.

Ao adicionar, aponte `HERO_PHOTO` em `src/app/touros/_components/Hero.tsx` e a
`openGraph.images` em `src/app/touros/layout.tsx` para os novos caminhos.
