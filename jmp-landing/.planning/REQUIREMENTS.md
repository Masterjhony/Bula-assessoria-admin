# Requirements — Nelore JMP Landing Page

## v1 Requirements

### LAYOUT
- [x] **LAY-01**: Página single-scroll com header fixo contendo logo Bula Assessoria e botão WhatsApp
- [x] **LAY-02**: Seção hero com imagem/vídeo de fundo do leilão JMP e overlay escuro (igual ao site da Bula)
- [x] **LAY-03**: Seção formulário de inscrição centralizada, fundo branco ou neutro, responsiva
- [x] **LAY-04**: Card destaque do leilão JMP com data, hora, local e imagem (Seção 2)
- [x] **LAY-05**: Footer idêntico ao padrão Bula Assessoria (preto, logo branco, links, copyright)

### FORMULÁRIO
- [x] **FORM-01**: Campo Nome Completo (input texto, obrigatório)
- [x] **FORM-02**: Campo Celular com máscara (XX) XXXXX-XXXX (obrigatório)
- [x] **FORM-03**: Campo UF — select dropdown com todos os 27 estados brasileiros (obrigatório)
- [x] **FORM-04**: Campo Cidade — input texto livre (obrigatório)
- [x] **FORM-05**: Campo Interesse — select com opções: Touros, Matrizes, Embrião, Sêmen (obrigatório)
- [x] **FORM-06**: Campo Tamanho do rebanho — select: "Até 50 cabeças", "51–200", "201–500", "501–1.000", "Acima de 1.000" (obrigatório)
- [x] **FORM-07**: Validação de todos campos obrigatórios antes do submit; exibir erros inline
- [x] **FORM-08**: Botão de submit com estado de loading durante processamento
- [x] **FORM-09**: Após submit bem-sucedido: redirecionar para /obrigado-jmp.html (que redireciona ao WhatsApp com countdown de 5s)
- [x] **FORM-10**: Função handleSubmit isolada e comentada como ponto de integração futura com Google Sheets

### VISUAL
- [x] **VIS-01**: Paleta: preto (#000), branco (#fff), dourado (#C8A96E), verde (#25D366)
- [x] **VIS-02**: Fonte Inter (Google Fonts) em todos os pesos usados (400, 600, 700, 800/black)
- [x] **VIS-03**: Ícones via lucide-react
- [x] **VIS-04**: Hover animations: -translate-y-1, shadow transitions (igual ao site da Bula)
- [x] **VIS-05**: Design responsivo mobile-first (breakpoints: sm 640px, lg 1024px)

### TECH
- [x] **TECH-01**: Projeto scaffolado com Vite + React 18 + Tailwind CSS v3
- [x] **TECH-02**: Link do grupo WhatsApp configurável via constante no topo do componente (sem .env por enquanto)

### MEGA EVENTO EAO BAVIERA (Phase 3)
- [x] **EAO-01**: Hero (badge, headline, value prop, benefícios, stat de data, localização) reescrito para o 13º Mega Evento EAO Baviera, sem resquício de copy do Nelore JMP
- [x] **EAO-02**: Background do hero (`src/content.ts`) e preload LCP (`index.html`) apontam para o mesmo asset `foto-leilao-eao.jpeg`
- [x] **EAO-03**: Bloco de identidade ao lado do logo Bula exibe o wordmark "EAO BAVIERA"; logo JMP e import não utilizado removidos
- [x] **EAO-04**: Título do formulário ("Garanta sua vaga / no Mega Evento EAO") e bloco de info rápida do evento (09 a 12 Jul · Fazenda Baviera, Itagibá/BA) atualizados
- [x] **EAO-05**: `<title>` da aba do navegador reflete o evento EAO Baviera
- [x] **EAO-06**: Nenhuma linha de Steps 1–3, `validateStep`, `submitForm`, `onSubmit`, `handleChange`, `handleUFChange` ou `goTo` alterada pelo reskin de conteúdo
- [x] **EAO-07**: Step 3 exige checkbox obrigatório de consentimento de contato via WhatsApp, bloqueando submit até ser marcado, com valor incluído automaticamente no payload de `/api/jmp/lead`
- [x] **EAO-08**: Hero e formulário não afirmam mais que a Bula selecionou/apartou os animais do 13º Mega Baviera especificamente — vendem a assessoria de compra gratuita (copy final aprovado pelo cliente)
- [x] **EAO-09**: `public/obrigado-jmp.html` não tem mais nenhum resquício textual do leilão Nelore JMP (`<title>` corrigido)
- [x] **EAO-10**: `src/components/Footer.tsx` confirmado sem alegação de aparte específica deste leilão (ou corrigido, se uma alegação fosse encontrada na execução)

## v2 Requirements (Deferred)

- Integração real com Google Sheets
- Integração com Supabase para persistência de leads
- Analytics / pixel de conversão
- A/B test de headlines

## Out of Scope

- Backend / API própria — sem servidor
- shadcn/ui — componentes manuais para controle total
- Múltiplas páginas / rotas
- Autenticação
- SSR / Next.js

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| LAY-01 → LAY-05 | Phase 1 | Complete |
| FORM-01 → FORM-10 | Phase 1 | Complete |
| VIS-01 → VIS-05 | Phase 1 | Complete |
| TECH-01 → TECH-02 | Phase 1 | Complete |
| EAO-01 → EAO-06 | Phase 3 (Plan 03-01) | Complete |
| EAO-07 | Phase 3 (Plan 03-02) | Complete |
| EAO-08 → EAO-10 | Phase 3 (Plan 03-03) | Complete |
