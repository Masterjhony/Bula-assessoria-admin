---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Completed 03-01-PLAN.md (Reskin de conteúdo EAO Baviera)
last_updated: "2026-07-09T01:29:00Z"
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 7
  completed_plans: 6
  percent: 86
---

# Project State — Nelore JMP Landing Page

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-07)

**Core value:** O formulário deve ser preenchido e enviado — tudo que não contribui para essa ação é ruído.
**Current focus:** Phase 03 — Mega Evento EAO Baviera — IN PROGRESS (Plan 1/2 complete)

## Current Phase

**Phase 3 of 3** — Mega Evento EAO Baviera — Reskin de Conteúdo
**Status:** IN PROGRESS

## Phase Progress

| Plan | Description | Status |
|------|-------------|--------|
| 03-01 | Reskin de conteúdo EAO Baviera (content.ts, Form.tsx identidade/título, index.html) | ✓ Complete |
| 03-02 | Checkbox de consentimento WhatsApp no Step 3 | Pending |

## Decisions Made

- Vite 5 with react-ts template (no Next.js — static landing page, no SSR needed)
- Tailwind CSS v3 pinned (v4 breaking changes avoided)
- Inter loaded via @import in index.css
- Componentes manuais com Tailwind (sem shadcn/ui)
- Assets placed in src/assets/ for clean Vite processing (logo_bula.PNG, foto_bulinha-background.jpeg)
- Added declare module '*.PNG' to vite-env.d.ts (vite/client only declares lowercase *.png)
- Added assetsInclude: ['**/*.PNG'] to vite.config.ts (Vite bundler build pipeline fix)
- Post-submit redirect goes to OBRIGADO_PAGE_URL (/obrigado-jmp.html), not directly to WhatsApp
- handleSubmit isolated as top-level function for future Google Sheets integration
- obrigado-jmp.html is a standalone HTML file (no React/Vite dependency) with 5s countdown
- Footer logo uses brightness-0 invert Tailwind classes for white-on-black rendering
- Wordmark de texto ("EAO BAVIERA") substitui o logo raster JMP no bloco de identidade do Form.tsx — sem asset de logo EAO disponível (Phase 3, Plan 03-01)
- hero.stats reduzido a um único item de data (09–12 JUL / 2026 · 4 dias), sem inventar contagem de lotes do novo evento (Phase 3, Plan 03-01)

## Last Session

**Timestamp:** 2026-07-09T01:29:00Z
**Stopped At:** Completed 03-01-PLAN.md (Reskin de conteúdo EAO Baviera) — Plan 03-02 (checkbox de consentimento WhatsApp) pendente
**Resume File:** .planning/phases/03-mega-evento-eao-baviera/03-02-PLAN.md

## Notes

- Link do grupo WhatsApp: https://chat.whatsapp.com/JYxJPWfkoHHLZfosHlywN9 (configured in src/constants.ts)
- Imagem do leilão JMP: usando foto-leilao-JMP.jpeg em src/assets/
- Integração Google Sheets: estrutura preparada (handleSubmit stub), implementação futura
- npm run build: PASSING — all 5 components compiled, dist/obrigado-jmp.html present
- Phase 3: `src/constants.ts` (WHATSAPP_GROUP_URL, OBRIGADO_PAGE_URL) continua apontando para o grupo/página do JMP — follow-up conhecido, não corrigido nesta fase
