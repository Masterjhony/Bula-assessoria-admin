---
phase: 01-landing-page-completa
plan: "02"
subsystem: frontend-components
tags: [react, tailwindcss, header, hero, assets]
dependency_graph:
  requires: [01-01-scaffold]
  provides: [header-component, hero-component, src-assets]
  affects: [03-form, 04-leilao-card, 05-footer-assembly]
tech_stack:
  added: []
  patterns: [fixed-header, background-image-overlay, lucide-react-icons, vite-asset-import]
key_files:
  created:
    - src/components/Header.tsx
    - src/components/Hero.tsx
    - src/assets/logo_bula.PNG
    - src/assets/foto_bulinha-background.jpeg
  modified:
    - src/vite-env.d.ts
decisions:
  - "Assets placed in src/assets/ for clean Vite processing (not project root)"
  - "Header import uses ../assets/logo_bula.PNG (src/components relative path)"
  - "Added declare module '*.PNG' to vite-env.d.ts — vite/client only declares lowercase *.png"
  - "Hero uses bg-cover bg-center Tailwind classes plus inline backgroundImage style"
metrics:
  duration: "~2 minutes"
  completed: "2026-06-08T01:21:55Z"
  tasks_completed: 4
  tasks_total: 4
  files_created: 4
  files_modified: 1
---

# Phase 1 Plan 02: Header + Hero Summary

Fixed header with Bula logo and WhatsApp CTA, plus Hero section with foto_bulinha background image and dark overlay — both built as standalone components ready for Plan 05 assembly.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create Header component with fixed positioning and WhatsApp button | e689d6e | src/components/Header.tsx |
| 2 | Copy logo asset to src/assets and verify import path | c6a5fcc | src/assets/logo_bula.PNG, src/assets/foto_bulinha-background.jpeg |
| 3 | Create Hero section with background image and dark overlay | 7d3a2c9 | src/components/Hero.tsx |
| 4 | Build check (with PNG type fix) | 1c968f0 | src/vite-env.d.ts |

## Verification Results

- [x] src/components/Header.tsx contains "fixed", "WHATSAPP_GROUP_URL", "MessageCircle", "z-50", "backdrop-blur"
- [x] src/components/Hero.tsx contains "bg-cover", "bg-black/60", "text-gold", "font-black"
- [x] src/assets/logo_bula.PNG exists
- [x] src/assets/foto_bulinha-background.jpeg exists
- [x] npm run build exits 0 (no TypeScript errors)
- [x] App.tsx NOT modified

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added uppercase PNG module declaration to vite-env.d.ts**
- **Found during:** Task 4 (build check)
- **Issue:** `tsc` error TS2307: "Cannot find module '../assets/logo_bula.PNG' or its corresponding type declarations." The `vite/client` type reference only declares `*.png` (lowercase) as a module, not `*.PNG` (uppercase). The logo file has an uppercase `.PNG` extension.
- **Fix:** Added `declare module '*.PNG' { const src: string; export default src }` to `src/vite-env.d.ts`
- **Files modified:** src/vite-env.d.ts
- **Commit:** 1c968f0

## Known Stubs

None — Header and Hero are fully implemented. Logo asset is real (logo_bula.PNG). Background image is real (foto_bulinha-background.jpeg). WhatsApp URL is still a placeholder (`PLACEHOLDER_LINK_AQUI`) in constants.ts — this is intentional and tracked in the Plan 01 Summary.

## Threat Flags

None — this plan creates only React components and copies static image assets. No network endpoints, auth paths, or trust boundaries introduced.

## Self-Check: PASSED
