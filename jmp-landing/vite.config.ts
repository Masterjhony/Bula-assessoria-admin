import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // logo_bula.PNG uses uppercase extension — tell Vite to treat it as a static asset
  assetsInclude: ['**/*.PNG'],
})
