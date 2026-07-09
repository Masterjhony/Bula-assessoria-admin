# Roadmap — Nelore JMP Landing Page

**3 fases** | **17 requirements fase 1** | Fase 1 COMPLETA ✓

---

### Phase 1: Landing Page Completa
**Goal:** Entregar a página funcional com formulário, destaque do leilão e footer — pronta para receber tráfego e converter leads
**Mode:** mvp
**Status:** COMPLETE

**Requirements:** LAY-01, LAY-02, LAY-03, LAY-04, LAY-05, FORM-01, FORM-02, FORM-03, FORM-04, FORM-05, FORM-06, FORM-07, FORM-08, FORM-09, FORM-10, VIS-01, VIS-02, VIS-03, VIS-04, VIS-05, TECH-01, TECH-02

**Success Criteria:**
1. ✓ Projeto roda com `npm run dev` sem erros
2. ✓ Formulário valida todos os campos e bloqueia submit inválido
3. ✓ Submit exibe mensagem de sucesso e redireciona para WhatsApp
4. ✓ Página é responsiva em mobile (375px) e desktop (1280px)
5. ✓ Visual consistente com a identidade Bula Assessoria

**Plans:**
1. ✓ Scaffold Vite + React + Tailwind — estrutura de pastas, dependências, Inter font (COMPLETE: 49a9326, 11c9ef3, 3a21d85, 9efa1c4)
2. ✓ Header + Hero — header fixo com logo e botão WhatsApp, seção hero com overlay (COMPLETE: e689d6e, c6a5fcc, 7d3a2c9, 1c968f0)
3. ✓ Formulário de inscrição — todos os campos com validação e máscara de celular (COMPLETE: e54b025)
4. ✓ Seção destaque do leilão JMP — card hero com data/hora/local/imagem (COMPLETE: dba74ff, b3bb4f6)
5. ✓ Footer + submit redirect — footer padrão Bula, App.tsx montado, obrigado-jmp.html (COMPLETE: 339655a, 1244046, c45333b, f5abd6e)

---

### Phase 2: Envasamento Bula + História do Bulinho
**Goal:** Ampliar a presença da seção BULA ASSESSORIA PECUÁRIA e incorporar a prova social "Bulinho apartou o gado pessoalmente" em todos os pontos de alta conversão da página, aumentando credibilidade e conversão de leads antes do leilão de 13-14 de Junho de 2026
**Status:** Pending

**Requirements:** CONV-01, CONV-02, CONV-03, CONV-04, CONV-05, CONV-06, COPY-01, COPY-02, COPY-03

**Success Criteria:**
1. Footer CTA expandido com eyebrow + headline 2 linhas + subline com prova social do Bulinho
2. ApartamentoGallery com heading reescrito, captions nas 8 fotos e CTA âncora no final
3. LeilaoCard 10º JMP com subtitle e badge "Apartamento feito pela Bula"
4. Form.tsx com copy corrigido (Você, indicações) e quote do Bulinho na coluna esquerda
5. Nova seção BulaConfianca (3 colunas) entre galeria e footer, com CTA
6. Página roda sem erros e é responsiva em mobile (375px) e desktop (1280px)

**Plans:**

---

### Phase 3: Mega Evento EAO Baviera — Reskin de Conteúdo
**Goal:** Substituir todo o conteúdo e identidade visual do leilão Nelore JMP na coluna hero e no formulário pelo 13º Mega Evento EAO Baviera (genética Nelore PO, 09 a 12 de Julho de 2026, Fazenda Baviera, Itagibá/BA), adicionar um checkbox obrigatório de consentimento de contato via WhatsApp no Step 3, e reposicionar o copy de "Bula selecionou os lotes deste leilão" (falso) para "Bula oferece assessoria de compra gratuita" (correto) — sem restruturar o formulário nem alterar campos/lógica pré-existentes além do necessário para essas mudanças
**Status:** COMPLETE

**Requirements:** EAO-01, EAO-02, EAO-03, EAO-04, EAO-05, EAO-06, EAO-07, EAO-08, EAO-09, EAO-10

**Success Criteria:**
1. ✓ Hero (coluna esquerda) exibe badge, headline, value prop, benefícios, stat de data e localização do Mega Evento EAO Baviera — nenhum resquício de copy do JMP
2. ✓ Background do hero (`src/content.ts`) e preload LCP (`index.html`) apontam para `foto-leilao-eao.jpeg`
3. ✓ Bloco de identidade ao lado do logo Bula exibe a marca do EAO Baviera — zero ocorrências de `jmpLogo`/`alt="JMP"` remanescentes, mas `/api/jmp/lead`, `JmpHero` e `jmp_utm` (infraestrutura não relacionada à marca) seguem intactos
4. ✓ Título do formulário e bloco de info rápida do evento refletem o Mega Evento EAO Baviera (09 a 12 Jul, Itagibá/BA)
5. ✓ `<title>` da aba do navegador reflete o evento EAO Baviera
6. ✓ Step 3 exige um checkbox obrigatório — "Autorizo a Bula Assessoria a entrar em contato comigo no WhatsApp" — bloqueando o submit até ser marcado, com o valor incluído automaticamente no payload de `/api/jmp/lead`
7. ✓ Steps 1 e 2, os demais campos/validações do Step 3, `submitForm` e `onSubmit` permanecem inalterados além da checagem do checkbox em `validateStep`
8. ✓ `npm run build` conclui com exit 0 (tsc -b + vite build)
9. ✓ Hero e formulário não afirmam mais que a Bula selecionou/apartou os animais deste leilão especificamente — vendem a assessoria de compra gratuita (copy final aprovado pelo cliente)
10. ✓ `public/obrigado-jmp.html` não tem mais nenhum resquício textual do leilão Nelore JMP (`<title>` corrigido)
11. ✓ `src/components/Footer.tsx` confirmado sem alegação de aparte específica deste leilão (ou corrigido, se uma alegação for encontrada na execução)

**Plans:**
1. ✓ Reskin de conteúdo EAO Baviera — `src/content.ts` (hero), `src/components/Form.tsx` (identidade, título, info do evento) e `index.html` (preload + title) (COMPLETE: 1715b1d, b8fdf5f, 7c1b733)
2. ✓ Checkbox de consentimento WhatsApp no Step 3 — `src/components/Form.tsx` (FormData, validateStep, handler dedicado, render do checkbox); depende da Plan 1 (mesmo arquivo) (COMPLETE: 0793527)
3. ✓ Correção de posicionamento comercial — `src/content.ts` (hero reposicionado para assessoria de compra gratuita), `src/components/Form.tsx` (Step 1, título do form, botão de submit) e `public/obrigado-jmp.html` (title); depende das Plans 1 e 2 (mesmos arquivos) (COMPLETE: af7791e, dbdf877, 5564a90)
