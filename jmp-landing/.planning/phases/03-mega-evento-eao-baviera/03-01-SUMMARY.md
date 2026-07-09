---
phase: 03-mega-evento-eao-baviera
plan: 01
subsystem: ui
tags: [react, vite, tailwind, content, static-copy]

# Dependency graph
requires: []
provides:
  - "DEFAULT_CONTENT.hero em src/content.ts reescrito para o 13º Mega Evento EAO Baviera"
  - "Identidade visual (wordmark EAO BAVIERA), título do form e info rápida do evento em Form.tsx atualizados"
  - "Preload LCP e <title> de index.html alinhados ao novo asset/evento"
affects: [03-mega-evento-eao-baviera/03-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reskin puro de conteúdo estático — nenhuma mudança em lógica/estado/handlers do formulário"

key-files:
  created: []
  modified:
    - src/content.ts
    - src/components/Form.tsx
    - index.html

key-decisions:
  - "Wordmark de texto ('EAO BAVIERA') substitui o antigo logo raster JMP — nenhum asset novo de logo disponível para o evento"
  - "stats do hero reduzido a um único item de data (09–12 JUL / 2026 · 4 dias), sem inventar contagem de lotes"

patterns-established:
  - "Referências de infraestrutura preexistentes que contêm 'jmp' em nomes técnicos (jmp_utm, /api/jmp/lead, JmpHero) são deliberadamente preservadas — não são copy visível, não confundir com resquícios de marca"

requirements-completed: [EAO-01, EAO-02, EAO-03, EAO-04, EAO-05, EAO-06]

# Metrics
duration: 12min
completed: 2026-07-09
---

# Phase 03 Plan 01: Reskin EAO Baviera Summary

**DEFAULT_CONTENT.hero, identidade/título/info-do-evento em Form.tsx, e preload LCP + `<title>` de index.html reescritos do leilão Nelore JMP para o 13º Mega Evento EAO Baviera, sem tocar em campos, validação ou lógica de submit do formulário.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-09T01:16:00Z
- **Completed:** 2026-07-09T01:28:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- `src/content.ts`: `DEFAULT_CONTENT.hero` inteiramente reescrito (backgroundUrl, badge, headline, valueProp, benefitsTitle, benefits, stats, locationLine1/2) para o Mega Evento EAO Baviera, 09–12 de Julho de 2026, Fazenda Baviera, Itagibá/BA.
- `src/components/Form.tsx`: import e uso do logo JMP removidos e substituídos por um wordmark de texto "EAO BAVIERA"; título do form passa a "Garanta sua vaga / no Mega Evento EAO"; bloco "Event quick info" atualizado para "09 a 12 Jul · Fazenda Baviera" / "Itagibá / BA".
- `index.html`: preload LCP aponta para `/foto-leilao-eao.jpeg` (idêntico ao `backgroundUrl` de `content.ts`); `<title>` atualizado para "13º Mega Evento EAO Baviera — Inscrições".
- Zero mudanças em Steps 1–3, `validateStep`, `submitForm`, `onSubmit`, `handleChange`, `handleUFChange`, `goTo`, `src/constants.ts`, ou infraestrutura de backend (`/api/jmp/lead`, `JmpHero`, `jmp_utm`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Reescrever DEFAULT_CONTENT.hero em src/content.ts** - `1715b1d` (feat)
2. **Task 2: Atualizar identidade, título do form e info do evento em Form.tsx** - `b8fdf5f` (feat)
3. **Task 3: Atualizar preload LCP e título em index.html + verificação final** - `7c1b733` (feat)

_Note: nenhuma task era TDD; todas single-commit._

## Files Created/Modified
- `src/content.ts` - `DEFAULT_CONTENT.hero` reescrito para o evento EAO Baviera (badge, headline, benefits, stats, localização)
- `src/components/Form.tsx` - wordmark de texto EAO BAVIERA, título do form e bloco de info rápida do evento atualizados; import do logo JMP removido
- `index.html` - preload LCP e `<title>` atualizados para o evento EAO Baviera

## Decisions Made
- Wordmark de texto substitui o logo raster JMP (sem asset de logo EAO disponível) — mantém alinhamento vertical via `items-center` já existente.
- `stats` do hero reduzido de 2 itens (contagem de touros/bezerras) para 1 item de data, evitando inventar uma contagem de lotes desconhecida.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `src/components/Form.tsx` está pronto para a Plan 03-02 adicionar o checkbox de consentimento WhatsApp ao Step 3, sem conflito com as edições desta plan (blocos de identidade/título/info do evento ficam fora do escopo da 03-02).
- `npx tsc --noEmit -p tsconfig.app.json` e `npm run build` passam limpos.

---
*Phase: 03-mega-evento-eao-baviera*
*Completed: 2026-07-09*

## Self-Check: PASSED
All files (src/content.ts, src/components/Form.tsx, index.html, 03-01-SUMMARY.md) found on disk. All task commits (1715b1d, b8fdf5f, 7c1b733) found in git log.
