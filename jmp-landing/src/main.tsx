import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initJmpAnalytics } from './analytics/posthog'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Analytics carrega posthog-js (~200 KiB) sob demanda e só depois do primeiro
// paint, para não competir com FCP/LCP. Em telas ociosas usamos requestIdleCallback;
// senão um timeout curto garante que ainda inicialize.
const startAnalytics = () => { void initJmpAnalytics() }
if ('requestIdleCallback' in window) {
  requestIdleCallback(startAnalytics, { timeout: 3000 })
} else {
  setTimeout(startAnalytics, 1500)
}
