---
phase: 03-mega-evento-eao-baviera
plan: 02
subsystem: ui
tags: [react, forms, validation, consent]

# Dependency graph
requires:
  - phase: 03-mega-evento-eao-baviera/03-01
    provides: "src/components/Form.tsx com identidade/título/info do evento EAO Baviera já reskinado"
provides:
  - "Campo whatsappConsent: boolean em FormData, validação obrigatória no Step 3, handler dedicado e checkbox renderizado"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FormErrors = { [K in keyof FormData]?: string } substitui Partial<FormData> como tipo do mapa de erros, necessário assim que FormData ganha um campo não-string"
    - "Handlers dedicados (handleUFChange, handleWhatsappConsentChange) para campos que precisam de lógica extra além do handleChange genérico de string"

key-files:
  created: []
  modified:
    - src/components/Form.tsx

key-decisions:
  - "whatsappConsent chega ao payload de /api/jmp/lead automaticamente via spread ...data em submitForm — nenhuma mudança na função de submit"
  - "Checkbox usa accent-gold (token de cor #C8A96E já definido em tailwind.config.js) para alinhar à paleta oficial da marca"

patterns-established:
  - "Novo campo booleano em FormData exige tipo dedicado FormErrors (mapa de mensagens sempre string, independente do tipo real do campo)"

requirements-completed: [EAO-07]

# Metrics
duration: 6min
completed: 2026-07-09
---

# Phase 03 Plan 02: Checkbox de Consentimento WhatsApp Summary

**Step 3 do formulário passa a exigir um checkbox de consentimento de contato via WhatsApp, com validação bloqueante e handler dedicado, sem alterar `submitForm`/`onSubmit`/Steps 1-2 — o valor viaja ao endpoint `/api/jmp/lead` automaticamente via `...data`.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-09T01:32:00Z
- **Completed:** 2026-07-09T01:38:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- `FormData` ganha `whatsappConsent: boolean` (inicial `false`); novo tipo `FormErrors = { [K in keyof FormData]?: string }` substitui `Partial<FormData>` nos três usos como mapa de erros (retorno de `validateStep`, variável interna `errors`, `useState` de erros do componente).
- `validateStep` (Step 3) bloqueia avanço/submit com `errors.whatsappConsent` quando o campo é `false`.
- Handler dedicado `handleWhatsappConsentChange` (não reaproveita `handleChange` genérico de string), no mesmo estilo de `handleUFChange`.
- Checkbox com o texto exato "Autorizo a Bula Assessoria a entrar em contato comigo no WhatsApp" renderizado no Step 3, após o bloco de quantidade e antes dos botões Voltar/Enviar, com `accent-gold` alinhado à paleta da marca.
- `npm run build` e `npx tsc --noEmit -p tsconfig.app.json` verificados sem erros; Steps 1/2, `UFCombobox`, `handleChange`, `goTo`, `submitForm`, `onSubmit` e `analyticsProfile` permanecem intocados.

## Task Commits

Each task was committed atomically:

1. **Task 1: Adicionar campo whatsappConsent, validação, handler dedicado e checkbox no Step 3** - `0793527` (feat)
2. **Task 2: Verificação final — build, regressão de Steps 1/2 e integridade do payload de submit** - verificação apenas, sem arquivos modificados (nenhum commit de código; ver build/regressão abaixo)

_Note: Task 2 não teve `<files>` no plano — apenas comandos de verificação (`npm run build`, greps de regressão). Nenhum commit de código associado a ela._

## Files Created/Modified
- `src/components/Form.tsx` - campo `whatsappConsent`, tipo `FormErrors`, validação obrigatória, handler dedicado e checkbox no Step 3

## Decisions Made
- `whatsappConsent` transporta ao payload de `/api/jmp/lead` só por fazer parte de `FormData` — `submitForm` não foi tocado, conforme especificado no plano.
- `FormErrors` foi introduzido em vez de estender `Partial<FormData>`, pois este último deixa de fazer sentido como tipo de mapa de erros assim que `FormData` ganha um campo `boolean`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. Persistência do campo `whatsappConsent` no backend do endpoint `/api/jmp/lead` é responsabilidade de um projeto separado (fora do escopo frontend-only desta fase), conforme sinalizado no plano.

## Next Phase Readiness
- Fase 03 (Mega Evento EAO Baviera) concluída: reskin de conteúdo (Plan 03-01) + checkbox de consentimento WhatsApp (Plan 03-02).
- Follow-up conhecido, não resolvido nesta fase: `src/constants.ts` (`WHATSAPP_GROUP_URL`, `OBRIGADO_PAGE_URL`) continua apontando para o grupo/página do JMP.

---
*Phase: 03-mega-evento-eao-baviera*
*Completed: 2026-07-09*

## Self-Check: PASSED
File src/components/Form.tsx and 03-02-SUMMARY.md found on disk. Commits 0793527 and e595da3 found in git log.
