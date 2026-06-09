# Roadmap — Nelore JMP Landing Page

**2 fases** | **17 requirements fase 1** | Fase 1 COMPLETA ✓

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
