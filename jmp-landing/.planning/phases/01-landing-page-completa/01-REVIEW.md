---
phase: 01-landing-page-completa
reviewed: 2026-06-07T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/main.tsx
  - src/App.tsx
  - src/index.css
  - src/constants.ts
  - src/components/Header.tsx
  - src/components/Hero.tsx
  - src/components/Form.tsx
  - src/components/LeilaoCard.tsx
  - src/components/Footer.tsx
  - public/obrigado-jmp.html
  - vite.config.ts
findings:
  critical: 3
  warning: 5
  info: 4
  total: 12
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-06-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the full Vite + React 18 + TypeScript + Tailwind CSS landing page for Leilão JMP. The implementation is functional and structurally clean, but three critical issues were found: the form silently swallows submission errors with no user feedback (data-loss risk), the WhatsApp group URL is hardcoded a second time in `obrigado-jmp.html` (creating a maintenance split-brain), and `main.tsx` uses a non-null assertion on `getElementById` without any fallback, which crashes silently if the DOM element is absent. Five warnings cover missing input sanitization, an incorrect phone validation boundary, a `console.log` that will leak PII to production browser consoles, submit-button hover state broken during loading, and `index.html` shipping the default Vite favicon. Four informational items are also noted.

---

## Critical Issues

### CR-01: Form submission errors are silently swallowed — user sees no feedback on failure

**File:** `src/components/Form.tsx:76-83`

**Issue:** `onSubmit` wraps `handleSubmit` in a `try/finally` block but has no `catch`. If `handleSubmit` ever throws (e.g., when a real HTTP POST to Google Sheets or Supabase is wired in), the error is discarded, `setLoading(false)` runs, and the form returns to its idle state with no error message shown to the user. The user has no way to know whether their data was sent or lost. Given the explicit `// TODO: POST to Google Sheets API` comment inside `handleSubmit`, this path will definitely be reached.

**Fix:**
```tsx
const [submitError, setSubmitError] = useState<string | null>(null)

async function onSubmit(e: React.FormEvent) {
  e.preventDefault()
  const validationErrors = validate(formData)
  if (Object.keys(validationErrors).length > 0) {
    setErrors(validationErrors)
    return
  }
  setLoading(true)
  setSubmitError(null)
  try {
    await handleSubmit(formData)
    window.location.href = OBRIGADO_PAGE_URL
  } catch (err) {
    setSubmitError('Ocorreu um erro ao enviar. Por favor, tente novamente.')
  } finally {
    setLoading(false)
  }
}

// In JSX, below the submit button:
{submitError && (
  <p className="text-red-500 text-sm text-center mt-2">{submitError}</p>
)}
```

---

### CR-02: WhatsApp URL hardcoded in two independent places — guaranteed to diverge

**File:** `public/obrigado-jmp.html:292` and `public/obrigado-jmp.html:310`

**Issue:** The WhatsApp group URL `https://chat.whatsapp.com/JYxJPWfkoHHLZfosHlywN9` is defined in `src/constants.ts` as `WHATSAPP_GROUP_URL` and is used correctly in `Header.tsx` and `Footer.tsx`. However, `obrigado-jmp.html` is a standalone HTML file that cannot import from `constants.ts`, so the same URL is hardcoded directly in both the anchor's `href` attribute (line 292) and the JS constant `WA_URL` (line 310). If the WhatsApp group link ever changes (groups get reset, spam, etc.), the developer must remember to update three separate files. One will be missed. The thank-you page — the highest-conversion moment in the funnel — will silently send users to a dead link.

**Fix:** Document this coupling explicitly at both sites, or replace the standalone HTML with a React route so the constant is shared. At minimum, add a comment at the top of `obrigado-jmp.html`:

```html
<!--
  IMPORTANT: The WhatsApp URL below is also defined in src/constants.ts (WHATSAPP_GROUP_URL).
  If the link changes, update BOTH files:
    1. src/constants.ts  — WHATSAPP_GROUP_URL
    2. public/obrigado-jmp.html — href on #btn-wa AND the WA_URL JS constant
-->
```

And consolidate within the file itself (currently the URL appears twice in the same file):
```js
// Line 292 href and line 310 WA_URL must always match.
// There is only one source of truth in this file: the WA_URL constant below.
const WA_URL = 'https://chat.whatsapp.com/JYxJPWfkoHHLZfosHlywN9';
// Set the button href dynamically from the same constant:
document.getElementById('btn-wa').href = WA_URL;
```
Then remove the `href` attribute from the anchor element.

---

### CR-03: Non-null assertion on `getElementById('root')` crashes without fallback

**File:** `src/main.tsx:6`

**Issue:** `document.getElementById('root')!` uses a TypeScript non-null assertion (`!`). If `index.html` ever lacks the `<div id="root">` (e.g., a build system strips it, a CDN injects a different HTML shell, or the file is served incorrectly), `createRoot(null)` throws an unhandled runtime exception, producing a blank white page with no diagnostic. This is particularly relevant because `index.html` currently uses the default Vite `vite.svg` favicon, suggesting it has not been fully hardened for production.

**Fix:**
```tsx
const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error(
    '[main.tsx] Mount point <div id="root"> not found in DOM. Check index.html.'
  )
}
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

---

## Warnings

### WR-01: `console.log` leaks lead PII to production browser console

**File:** `src/components/Form.tsx:52`

**Issue:** `console.log('Lead captured:', data)` logs the full `FormData` object — including user name, phone number, city, and state — to the browser developer console in every environment, including production. This is both a privacy issue (anyone with DevTools open sees other users' form submissions if the page is shared/embedded) and a data hygiene problem. LGPD (Brazil's data protection law) applies here.

**Fix:** Remove the log entirely, or guard it behind an environment flag:
```ts
if (import.meta.env.DEV) {
  console.log('Lead captured:', data)
}
```

---

### WR-02: Phone validation accepts 10-digit numbers as valid, but 10-digit BR mobile numbers do not exist

**File:** `src/components/Form.tsx:40`

**Issue:** The validation condition is `if (digits.length < 10)`, which means a 10-digit string passes. Brazilian mobile numbers (celular) always have 11 digits (2 DDD + 9 digits). A 10-digit entry is a landline number or a malformed mobile number — neither is useful for a WhatsApp group. The mask allows up to 11 digits (`.slice(0, 11)`) but the validator accepts 10, creating an inconsistency where the user can submit an obviously incomplete mobile number.

**Fix:**
```ts
if (digits.length < 11) errors.celular = 'Celular inválido — informe DDD + número (11 dígitos)'
```

---

### WR-03: Submit button hover CSS transform conflicts with `disabled` state

**File:** `src/components/Form.tsx:195`

**Issue:** The submit button has `hover:-translate-y-0.5` unconditionally. While `disabled:opacity-60` correctly reduces visual prominence during loading, Tailwind's `disabled:` variant does not suppress `hover:` transforms in CSS — the browser still applies `:hover` styles to disabled elements. The button therefore visually "lifts" on hover even while `loading=true`, giving a false affordance that clicking will do something.

**Fix:** Replace the unconditional hover transform with a conditional or use the `disabled:hover:translate-y-0` utility:
```tsx
className="... hover:-translate-y-0.5 disabled:hover:translate-y-0 disabled:cursor-not-allowed ..."
```

---

### WR-04: `index.html` ships the default Vite placeholder favicon

**File:** `index.html:6`

**Issue:** `<link rel="icon" type="image/svg+xml" href="/vite.svg" />` references the default Vite scaffold favicon. In production this renders the Vite logo in browser tabs, bookmarks, and mobile home screens — instead of the Bula Assessoria Pecuária brand. The project assets include several `FORMULA DO BOI_LOGO-*.svg` files at the project root that should be used instead.

**Fix:** Replace with a branded favicon. Copy the appropriate SVG to `public/` and update the tag:
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

---

### WR-05: `obrigado-jmp.html` countdown does not update the display before first tick

**File:** `public/obrigado-jmp.html:324-335`

**Issue:** The `setInterval` fires after the first 1000ms delay. During that first second the displayed countdown shows "5" — correct. However, because `seconds--` runs before `el.textContent = seconds`, the display sequence is: 5 (initial, static) → 4 → 3 → 2 → 1 → redirect. The countdown appears to skip "0" entirely and redirects while showing "1". This looks broken to users expecting to see "0" before the redirect fires.

**Fix:** Decrement and check after updating the display, or use a zero-check before redirect that still shows "0":
```js
const timer = setInterval(function() {
  seconds--;
  const el = document.getElementById('countdown');
  if (el) el.textContent = String(seconds);
  if (seconds <= 0) {
    clearInterval(timer);
    if (!redirectDone) {
      redirectDone = true;
      window.location.href = WA_URL;
    }
  }
}, 1000);
```
This at minimum shows "0" in the display for one frame before the redirect. For a cleaner UX, initialize `seconds = 6` so the visible range is 5 → 4 → 3 → 2 → 1 → 0 → redirect.

---

## Info

### IN-01: `index.css` imported twice — once in `main.tsx` and once in `App.tsx`

**File:** `src/App.tsx:1` and `src/main.tsx:3`

**Issue:** `import './index.css'` appears in both `main.tsx` (line 3) and `App.tsx` (line 1). Vite deduplicates CSS module imports, so there is no runtime breakage, but the redundant import is misleading — it implies CSS is applied at two points in the tree when it is actually applied once. It also creates confusion about which file is the canonical CSS entry point.

**Fix:** Remove the import from `App.tsx` and keep it only in `main.tsx`, which is the true entry point.

---

### IN-02: `handleSubmit` module-level function instead of being inlined or a hook

**File:** `src/components/Form.tsx:50-54`

**Issue:** `handleSubmit` is defined as a module-level `async function` outside the component, yet it receives `FormData` as a parameter and has no access to React context or state. The comment `// Replace the body of this function to integrate with external services` suggests it is meant as an integration seam. This is fine architecturally, but the `TODO` comment on line 51 is a shipping artifact that should be resolved or tracked in an issue, not left in source code.

**Fix:** Remove or convert the `TODO` to a documented placeholder comment, and ensure there is a tracked issue for the integration work:
```ts
// Integration point: POST form data to backend (Google Sheets, Supabase, etc.)
// See: [issue/ticket reference]
async function handleSubmit(data: FormData): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 800)) // remove when real integration is added
}
```

---

### IN-03: `LeilaoCard` displays "A confirmar" for date, time, and location — content is incomplete

**File:** `src/components/LeilaoCard.tsx:35,45,55`

**Issue:** All three event detail fields (Data, Horário, Local) display the placeholder text "A confirmar". This is not a bug — it may be intentional while the event is being planned — but it ships a publicly visible card with three identical placeholder values. If this lands in production before the event details are known, it undermines credibility for a premium cattle auction brand.

**Fix:** Either populate the actual event details before go-live, or hide the section entirely until they are confirmed (conditionally render the card based on a flag in `constants.ts`).

---

### IN-04: Unused `react.svg` asset in `src/assets/`

**File:** `src/assets/react.svg` (not in reviewed files, discovered via directory listing)

**Issue:** The default Vite scaffold asset `react.svg` remains in `src/assets/`. It is not imported anywhere in the reviewed files and contributes to build output noise.

**Fix:** Delete `src/assets/react.svg`.

---

_Reviewed: 2026-06-07T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
