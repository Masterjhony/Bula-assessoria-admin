# Página de Inscrição — Nelore JMP

## What This Is

Landing page de captura de leads 100% focada em conversão para os leilões do criatório Nelore JMP, parceiro da Bula Assessoria Pecuária. O visitante preenche um formulário de inscrição com interesse em Touros, Matrizes, Embrião ou Sêmen, e é redirecionado ao grupo de WhatsApp do leilão ao confirmar. A página segue a identidade visual da Bula Assessoria (preto, branco, dourado) e é construída em Vite + React + Tailwind CSS.

## Core Value

O formulário deve ser preenchido e enviado — tudo que não contribui para essa ação é ruído.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Seção 1: Formulário com campos Nome Completo, Celular (com máscara), UF (select), Cidade (texto), Interesse (select multi: Touros/Matrizes/Embrião/Sêmen), Tamanho do rebanho (select)
- [ ] Seção 2: Card destaque do leilão JMP com data, hora, local e imagem (hero)
- [ ] Footer visual consistente com Bula Assessoria
- [ ] Após envio do formulário: redirecionar para link de grupo WhatsApp (link fornecido pelo usuário)
- [ ] Estrutura de submit preparada para integração futura com Google Sheets (função handleSubmit isolada, fácil de substituir)
- [ ] Validação dos campos obrigatórios no frontend antes do envio
- [ ] Design responsivo mobile-first

### Out of Scope

- Backend real / API própria — estrutura preparada mas não implementada
- Integração com Google Sheets — futuro, fora do escopo atual
- Múltiplas páginas ou rotas
- Autenticação ou área restrita
- shadcn/ui — componentes manuais com Tailwind para manter leveza

## Context

- Referência visual: bulaassessoria.com/agenda (Next.js + Tailwind)
- Paleta: preto (#000), branco (#fff), dourado (#C8A96E / #A68B4B), verde WhatsApp (#25D366)
- Tipografia: Inter (Google Fonts)
- Estilo: rounded-md, border-black/10, shadow-sm, hover -translate-y-1, backdrop-blur, gradientes
- Fontes dos ícones: Lucide React
- Stack: Vite + React 18 + Tailwind CSS v3
- Link do grupo WhatsApp: a ser fornecido pelo usuário antes do deploy

## Constraints

- **Tech stack**: Vite + React + Tailwind CSS v3 — sem Next.js, sem backend
- **Frontend only**: zero dependências de servidor; integração Google Sheets é futura
- **Sem shadcn/ui**: componentes escritos manualmente para controle total do estilo
- **Conversão**: a página tem UMA missão — lead preenchido + redirect WhatsApp

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Vite + React (não Next.js) | Landing page estática, sem SSR necessário, deploy simples | — Pending |
| Componentes manuais (não shadcn) | Controle total do visual, sem overhead de setup | — Pending |
| Redirect WhatsApp após submit | Converte lead + move para canal de venda imediato | — Pending |
| handleSubmit isolado | Facilita troca por integração real sem refactor | — Pending |

---
*Last updated: 2026-06-07 after initialization*

## Evolution

Este documento evolui a cada transição de fase.

**Após cada fase:**
1. Requirements invalidados? → Mover para Out of Scope
2. Requirements validados? → Mover para Validated
3. Novos requirements? → Adicionar em Active
